'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface LoginLayoutProps {
  /** 服务名称 */
  serviceName: string;
  /** 品牌描述 */
  brandDescription?: string;
  /** 表单标题 */
  formTitle: string;
  /** Logo URL */
  logoUrl?: string;
  /** 品牌图标 */
  brandIcon?: React.ReactNode;
  /** 表单内容 */
  children: React.ReactNode;
  /** 底部链接 (如 "注册新账户") */
  footerLink?: {
    text: string;
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

// 网格背景动画组件
function AnimatedGrid() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #eef5ff 0%, #dcecff 100%)',
      }}
    >
      {/* 动画网格 */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(47,128,237,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47,128,237,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* 渐变光效 */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(47,128,237,0.14), transparent 70%)',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

export function LoginLayout({
  serviceName,
  brandDescription,
  formTitle,
  logoUrl,
  brandIcon,
  children,
  footerLink,
}: LoginLayoutProps) {
  return (
    <div
      className="login-split"
      style={{
        display: 'flex',
        minHeight: '100vh',
      }}
    >
      {/* Brand Section with Animated Background */}
      <motion.div
        className="login-brand relative overflow-hidden"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 48,
          borderRadius: 0,
        }}
      >
        <AnimatedGrid />

        {/* 内容层 */}
        <div className="relative z-10" style={{ textAlign: 'center' }}>
          {logoUrl ? (
            <motion.img
              src={logoUrl}
              alt={serviceName}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{
                width: 64,
                height: 64,
                marginBottom: 16,
              }}
            />
          ) : brandIcon ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{ marginBottom: 16 }}
            >
              {brandIcon}
            </motion.div>
          ) : null}

          <motion.div
            className="login-brand-logo"
            data-brand-name={serviceName}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: '#0f172a',
              marginBottom: 16,
            }}
          >
            {serviceName}
          </motion.div>

          {brandDescription && (
            <motion.div
              className="login-brand-desc"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              style={{
                fontSize: 14,
                color: '#475569',
                maxWidth: 280,
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              {brandDescription}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Form Section */}
      <motion.div
        className="login-form"
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          flex: 1,
          background: 'var(--background)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 48,
        }}
      >
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <motion.h3
            className="login-form-title"
            data-form-title={formTitle}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--foreground)',
              marginBottom: 24,
            }}
          >
            {formTitle}
          </motion.h3>

          <motion.div
            data-form-content=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            style={{ minHeight: 100 }}
          >
            {children}
          </motion.div>

          {footerLink && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              style={{
                textAlign: 'center',
                marginTop: 24,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              <span>{footerLink.text} </span>
              {footerLink.href ? (
                <motion.a
                href={footerLink.href}
                whileHover={{ scale: 1.05 }}
                style={{
                  color: 'var(--primary)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
                >
                  {footerLink.label}
                </motion.a>
              ) : (
                <motion.span
                  onClick={footerLink.onClick}
                  whileHover={{ scale: 1.05 }}
                  style={{
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {footerLink.label}
                </motion.span>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 768px) {
          .login-split {
            flex-direction: column;
          }
          .login-brand {
            min-height: 200px;
            padding: 24px;
          }
          .login-form {
            padding: 24px;
          }
        }
      `}</style>
    </div>
  );
}

export default LoginLayout;
