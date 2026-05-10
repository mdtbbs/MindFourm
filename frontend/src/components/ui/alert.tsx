'use client';

interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  message: string;
  className?: string;
}

const typeClasses = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export default function Alert({ type = 'info', message, className = '' }: AlertProps) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border text-sm ${typeClasses[type]} ${className}`}
      role="alert"
    >
      {message}
    </div>
  );
}
