import * as React from 'react';
import { cn } from '../../lib/utils';

const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => (
    <div ref={ref} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
));
Progress.displayName = 'Progress';

export { Progress };
