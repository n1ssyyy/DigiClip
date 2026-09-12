import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import AppLayout from './layouts/AppLayout';

createInertiaApp({
    title: (title) => (title ? `${title} - DigiClip` : 'DigiClip'),
    // Built-in blue progress bar off: PageLine owns the loading line.
    progress: false,
    resolve: (name) => {
        const pages = import.meta.glob('./pages/**/*.jsx', { eager: true });
        const page = pages[`./pages/${name}.jsx`];
        if (!page) throw new Error(`Missing page: ${name}.jsx`);
        page.default.layout ??= (children) => <AppLayout>{children}</AppLayout>;
        return page;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});
