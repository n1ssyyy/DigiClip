import * as React from 'react';
import { cn } from '../../lib/utils';

// Beveled metallic edge: the border itself carries the light — brightest
// on top, a step dimmer on the sides, dark on the bottom. No blur and no
// sheen, so the edge stays razor sharp. The surface is a touch darker
// than the --card token so panels sit deeper than the rows inside them.
const Card = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-md border border-x-white/[0.08] border-b-black/50 border-t-white/15 bg-[color-mix(in_srgb,var(--card)_78%,black)] text-card-foreground', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[13px] text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
