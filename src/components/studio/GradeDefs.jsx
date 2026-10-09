import { GRADES } from '../../lib/sceneFields';
import { gradeSteps } from '../../lib/effectsLook';

const FILTERED = GRADES.filter((g) => g !== 'none');

/** The id of a grade's filter under a prefix (one per place that defines them). */
export const gradeId = (prefix, grade) => `${prefix}-${grade}`;

/** `filter: url(#...)` for a grade, or undefined for none. */
export const gradeFilter = (prefix, grade) => (grade && grade !== 'none' ? `url(#${gradeId(prefix, grade)})` : undefined);

function Steps({ steps }) {
    return steps.map((s, i) => {
        if (s.matrix) return <feColorMatrix key={i} type="matrix" values={s.matrix.join(' ')} />;
        if (s.saturate !== undefined) return <feColorMatrix key={i} type="saturate" values={String(s.saturate)} />;
        return (
            <feComponentTransfer key={i}>
                <feFuncR type="table" tableValues={s.tables.r.join(' ')} />
                <feFuncG type="table" tableValues={s.tables.g.join(' ')} />
                <feFuncB type="table" tableValues={s.tables.b.join(' ')} />
            </feComponentTransfer>
        );
    });
}

/**
 * The colour grades as SVG filters (`gradeSteps`: the engine's numbers),
 * invisible and zero-sized. They work in sRGB, where the engine's video
 * maths lives, not in SVG's default linear light.
 */
export default function GradeDefs({ prefix }) {
    return (
        <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
            <defs>
                {FILTERED.map((g) => (
                    <filter key={g} id={gradeId(prefix, g)} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                        <Steps steps={gradeSteps(g)} />
                    </filter>
                ))}
            </defs>
        </svg>
    );
}
