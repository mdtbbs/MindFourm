'use client';

import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
  secondary: 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 active:bg-surface-300 focus:ring-2 focus:ring-surface-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
  ghost: 'bg-transparent text-surface-600 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-gray-700 active:bg-surface-200 focus:ring-2 focus:ring-surface-400',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
