//! The app payload embedded in this Setup (offline installer).
//!
//! CI appends the platform's app payload to a "container" file with
//! `setup/scripts/pack.mjs`, followed by a fixed trailer:
//!
//! ```text
//! [payload: N bytes][version: V bytes UTF-8][V: u32 LE][N: u64 LE][MAGIC: 8 bytes]
//! ```
//!
//! The container is:
//! - Windows: the Setup exe itself (PE overlay — the loader ignores it),
//! - Linux: the Setup AppImage (`$APPIMAGE`; squashfs ignores trailing data),
//! - macOS: `DigiClip Setup.app/Contents/Resources/payload.bin` (appending
//!   to the Mach-O would break its code signature).
//!
//! A Setup without a trailer (dev builds, the Windows uninstaller copy) runs
//! in maintenance mode: detect + uninstall only.
//!
//! A code-signed Windows Setup is signed *after* packing, so the signature
//! covers the payload too. Authenticode then appends its certificate table
//! (8-byte aligned) behind the trailer; the reader looks past it.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub const MAGIC: &[u8; 8] = b"DGCSETUP";
const TRAILER: u64 = 4 + 8 + 8;

#[derive(Debug, Clone)]
pub struct Payload {
    /// File holding the payload bytes (see module docs).
    pub container: PathBuf,
    /// Byte offset of the payload inside `container`.
    pub offset: u64,
    pub len: u64,
    /// DigiClip version the payload installs.
    pub version: String,
}

/// Where this platform keeps the payload.
fn container() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    #[cfg(target_os = "macos")]
    {
        // <bundle>/Contents/MacOS/<exe> → <bundle>/Contents/Resources/payload.bin
        if let Some(contents) = exe.parent().and_then(Path::parent) {
            let p = contents.join("Resources").join("payload.bin");
            if p.is_file() {
                return Some(p);
            }
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        // Inside an AppImage, current_exe is the squashfs mount; the
        // trailer lives on the .AppImage file itself.
        if let Some(p) = std::env::var_os("APPIMAGE").map(PathBuf::from) {
            if p.is_file() {
                return Some(p);
            }
        }
    }
    Some(exe)
}

/// Offset of the PE security directory entry (the Authenticode table's
/// `(offset, size)` pair) in `head`, the first bytes of a file. `None`
/// when `head` isn't a PE image.
fn cert_dir_pos(head: &[u8]) -> Option<usize> {
    if head.get(0..2)? != b"MZ" {
        return None;
    }
    let pe = u32::from_le_bytes(head.get(0x3c..0x40)?.try_into().ok()?) as usize;
    if head.get(pe..pe.checked_add(4)?)? != b"PE\0\0" {
        return None;
    }
    let opt = pe + 4 + 20;
    let dirs = match u16::from_le_bytes(head.get(opt..opt + 2)?.try_into().ok()?) {
        0x10b => opt + 96,
        0x20b => opt + 112,
        _ => return None,
    };
    // NumberOfRvaAndSizes sits right before the directories; security is #4.
    let count = u32::from_le_bytes(head.get(dirs - 4..dirs)?.try_into().ok()?);
    let pos = dirs + 4 * 8;
    (count > 4 && head.len() >= pos + 8).then_some(pos)
}

/// The file's first 4 KiB: enough for any PE header we build.
fn head(f: &mut File) -> Option<Vec<u8>> {
    let mut head = Vec::with_capacity(4096);
    f.seek(SeekFrom::Start(0)).ok()?;
    f.take(4096).read_to_end(&mut head).ok()?;
    Some(head)
}

/// The security directory entry at `pos`: `(offset, size)`.
fn dir_entry(head: &[u8], pos: usize) -> (u64, u64) {
    let word = |at: usize| u32::from_le_bytes([head[at], head[at + 1], head[at + 2], head[at + 3]]) as u64;
    (word(pos), word(pos + 4))
}

/// Where the trailer ends: the end of the file, or on a signed exe the
/// start of the certificate table minus its zero alignment padding (the
/// trailer ends in MAGIC, never in a zero byte).
fn data_end(f: &mut File, total: u64) -> u64 {
    let table = head(f)
        .and_then(|h| cert_dir_pos(&h).map(|pos| dir_entry(&h, pos)))
        .filter(|&(off, size)| off != 0 && off.checked_add(size) == Some(total));
    let Some((off, _)) = table else {
        return total;
    };
    let pad = off.min(7);
    let mut buf = vec![0u8; pad as usize];
    if f.seek(SeekFrom::Start(off - pad)).is_err() || f.read_exact(&mut buf).is_err() {
        return off;
    }
    off - buf.iter().rev().take_while(|b| **b == 0).count() as u64
}

/// Clear a security directory entry that points past the end of the
/// file. The Windows uninstaller is the Setup cut back to its program
/// bytes, and on a signed Setup its header still names the certificate
/// table of the whole file.
pub fn clear_dangling_cert_dir(path: &Path) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().read(true).write(true).open(path)?;
    let total = f.metadata()?.len();
    let Some(head) = head(&mut f) else {
        return Ok(());
    };
    let Some(pos) = cert_dir_pos(&head) else {
        return Ok(());
    };
    let (off, size) = dir_entry(&head, pos);
    if (off == 0 && size == 0) || off + size <= total {
        return Ok(());
    }
    f.seek(SeekFrom::Start(pos as u64))?;
    f.write_all(&[0u8; 8])?;
    f.flush()
}

/// Parse the trailer at the end of `path`, if there is one.
pub fn read_trailer(path: &Path) -> Option<Payload> {
    let mut f = File::open(path).ok()?;
    let total = f.metadata().ok()?.len();
    let total = data_end(&mut f, total);
    if total < TRAILER {
        return None;
    }
    let mut t = [0u8; TRAILER as usize];
    f.seek(SeekFrom::Start(total - TRAILER)).ok()?;
    f.read_exact(&mut t).ok()?;
    if &t[12..20] != MAGIC {
        return None;
    }
    let vlen = u32::from_le_bytes(t[0..4].try_into().ok()?) as u64;
    let len = u64::from_le_bytes(t[4..12].try_into().ok()?);
    let offset = total
        .checked_sub(TRAILER)?
        .checked_sub(vlen)?
        .checked_sub(len)?;
    if vlen > 64 {
        return None;
    }
    let mut v = vec![0u8; vlen as usize];
    f.seek(SeekFrom::Start(offset + len)).ok()?;
    f.read_exact(&mut v).ok()?;
    let version = String::from_utf8(v).ok()?.trim().to_string();
    if version.is_empty() {
        return None;
    }
    Some(Payload {
        container: path.to_path_buf(),
        offset,
        len,
        version,
    })
}

/// The payload this Setup carries, if any.
pub fn embedded() -> Option<Payload> {
    read_trailer(&container()?)
}

impl Payload {
    /// A reader over exactly the payload bytes.
    pub fn open(&self) -> std::io::Result<Section> {
        let mut file = File::open(&self.container)?;
        file.seek(SeekFrom::Start(self.offset))?;
        Ok(Section {
            file,
            start: self.offset,
            len: self.len,
            pos: 0,
        })
    }

    /// Size of the Setup program without the payload — the part worth
    /// keeping as the uninstaller when the container is the exe itself.
    #[cfg(target_os = "windows")]
    pub fn stub_len(&self) -> Option<u64> {
        let exe = std::env::current_exe().ok()?;
        (exe == self.container).then_some(self.offset)
    }
}

/// `Read + Seek` window over `[start, start + len)` of a file (the zip
/// reader needs to seek; tar/gzip only read).
pub struct Section {
    file: File,
    start: u64,
    len: u64,
    pos: u64,
}

impl Read for Section {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let left = self.len.saturating_sub(self.pos);
        if left == 0 {
            return Ok(0);
        }
        let want = buf.len().min(left as usize);
        let n = self.file.read(&mut buf[..want])?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for Section {
    fn seek(&mut self, to: SeekFrom) -> std::io::Result<u64> {
        let target = match to {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => self.len as i128 + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if target < 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "seek before start of payload",
            ));
        }
        let target = target as u64;
        self.file.seek(SeekFrom::Start(self.start + target))?;
        self.pos = target;
        Ok(target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn pack(prefix: &[u8], payload: &[u8], version: &str) -> tempfile_path::TempPath {
        let path = tempfile_path::TempPath::new();
        let mut f = File::create(&path.0).unwrap();
        f.write_all(prefix).unwrap();
        f.write_all(payload).unwrap();
        f.write_all(version.as_bytes()).unwrap();
        f.write_all(&(version.len() as u32).to_le_bytes()).unwrap();
        f.write_all(&(payload.len() as u64).to_le_bytes()).unwrap();
        f.write_all(MAGIC).unwrap();
        path
    }

    // Tiny self-cleaning temp file (no extra dev-dependency).
    mod tempfile_path {
        pub struct TempPath(pub std::path::PathBuf);
        impl TempPath {
            pub fn new() -> Self {
                use std::sync::atomic::{AtomicU32, Ordering};
                static N: AtomicU32 = AtomicU32::new(0);
                Self(std::env::temp_dir().join(format!(
                    "digiclip-payload-test-{}-{}",
                    std::process::id(),
                    N.fetch_add(1, Ordering::SeqCst)
                )))
            }
        }
        impl Drop for TempPath {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.0);
            }
        }
    }

    #[test]
    fn round_trip() {
        let p = pack(b"MZ-program-bytes", b"payload-bytes-here", "2.3.2");
        let info = read_trailer(&p.0).expect("trailer");
        assert_eq!(info.version, "2.3.2");
        assert_eq!(info.offset, 16);
        assert_eq!(info.len, 18);
        let mut s = String::new();
        info.open().unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "payload-bytes-here");
    }

    #[test]
    fn section_seeks_within_window() {
        let p = pack(b"abc", b"0123456789", "1.0.0");
        let info = read_trailer(&p.0).unwrap();
        let mut sec = info.open().unwrap();
        assert_eq!(sec.seek(SeekFrom::End(-3)).unwrap(), 7);
        let mut s = String::new();
        sec.read_to_string(&mut s).unwrap();
        assert_eq!(s, "789");
        assert!(sec.seek(SeekFrom::Current(-100)).is_err());
    }

    #[test]
    fn no_trailer_means_no_payload() {
        let path = tempfile_path::TempPath::new();
        std::fs::write(&path.0, b"just a program, nothing appended").unwrap();
        assert!(read_trailer(&path.0).is_none());
    }

    /// A bare PE header (`magic` 0x10b = PE32, 0x20b = PE32+) whose
    /// security directory is `(off, size)`.
    fn fake_pe(magic: u16, off: u32, size: u32) -> Vec<u8> {
        let mut b = vec![0u8; 0x200];
        b[0..2].copy_from_slice(b"MZ");
        b[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        b[0x80..0x84].copy_from_slice(b"PE\0\0");
        let opt = 0x80 + 24;
        b[opt..opt + 2].copy_from_slice(&magic.to_le_bytes());
        let dirs = opt + if magic == 0x10b { 96 } else { 112 };
        b[dirs - 4..dirs].copy_from_slice(&16u32.to_le_bytes());
        b[dirs + 32..dirs + 36].copy_from_slice(&off.to_le_bytes());
        b[dirs + 36..dirs + 40].copy_from_slice(&size.to_le_bytes());
        b
    }

    /// What signtool does to a packed Setup: pad to 8 bytes, append the
    /// certificate table, point the security directory at it.
    fn sign(path: &Path, magic: u16) {
        let mut bytes = std::fs::read(path).unwrap();
        while bytes.len() % 8 != 0 {
            bytes.push(0);
        }
        let off = bytes.len() as u32;
        let cert = [0x30u8; 24];
        bytes.extend_from_slice(&cert);
        let hdr = fake_pe(magic, off, cert.len() as u32);
        bytes[..0x200].copy_from_slice(&hdr);
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn signed_setup_keeps_its_payload() {
        for magic in [0x20b, 0x10b] {
            // An odd-length payload so the signer has to pad.
            let p = pack(&fake_pe(magic, 0, 0), b"payload-of-odd-len", "2.6.0");
            sign(&p.0, magic);
            let info = read_trailer(&p.0).expect("trailer behind the signature");
            assert_eq!(info.version, "2.6.0");
            assert_eq!(info.offset, 0x200);
            let mut s = String::new();
            info.open().unwrap().read_to_string(&mut s).unwrap();
            assert_eq!(s, "payload-of-odd-len");
        }
    }

    #[test]
    fn unsigned_pe_reads_as_before() {
        let p = pack(&fake_pe(0x20b, 0, 0), b"abc", "1.2.3");
        assert_eq!(read_trailer(&p.0).unwrap().version, "1.2.3");
    }

    #[test]
    fn uninstaller_cut_drops_the_dangling_signature() {
        let path = tempfile_path::TempPath::new();
        // Points past the end: cleared.
        std::fs::write(&path.0, fake_pe(0x20b, 0x1000, 0x40)).unwrap();
        clear_dangling_cert_dir(&path.0).unwrap();
        assert_eq!(std::fs::read(&path.0).unwrap(), fake_pe(0x20b, 0, 0));
        // A table inside the file (a signed stub) stays.
        std::fs::write(&path.0, fake_pe(0x20b, 0x100, 0x40)).unwrap();
        clear_dangling_cert_dir(&path.0).unwrap();
        assert_eq!(std::fs::read(&path.0).unwrap(), fake_pe(0x20b, 0x100, 0x40));
        // Not a PE: untouched.
        std::fs::write(&path.0, b"plain bytes").unwrap();
        clear_dangling_cert_dir(&path.0).unwrap();
        assert_eq!(std::fs::read(&path.0).unwrap(), b"plain bytes");
    }

    #[test]
    fn corrupt_lengths_are_rejected() {
        let path = tempfile_path::TempPath::new();
        let mut bytes = b"x".to_vec();
        bytes.extend_from_slice(&3u32.to_le_bytes());
        bytes.extend_from_slice(&u64::MAX.to_le_bytes());
        bytes.extend_from_slice(MAGIC);
        std::fs::write(&path.0, bytes).unwrap();
        assert!(read_trailer(&path.0).is_none());
    }
}
