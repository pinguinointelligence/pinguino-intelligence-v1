import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={cn(buttonClasses(variant, size), className)} {...rest} />;
}
