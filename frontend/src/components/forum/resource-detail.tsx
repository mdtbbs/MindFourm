'use client';

import { useState } from 'react';
import { Resource } from '@/types';
import {
  Download, Calendar, User, Tag, Star, GitBranch,
  MessageSquare, Eye, Clock, Package
} from 'lucide-react';
import ResourceOverview from './resource-overview';
import ResourceUpdates from './resource-updates';
import ResourceReviews from './resource-reviews';
import ResourceVersions from './resource-versions';

interface ResourceDetailProps {
  resource: Resource;
}

type TabType = 'overview' | 'updates' | 'reviews' | 'versions';

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs = [
    { id: 'overview' as TabType, label: '概述', icon: Eye },
    { id: 'updates' as TabType, label: '更新', icon: GitBranch, count: resource.versions?.length || 0 },
    { id: 'reviews' as TabType, label: '评价', icon: MessageSquare, count: 0 },
    { id: 'versions' as TabType, label: '版本', icon: Package },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <div className="flex items-start gap-6">
          {/* Resource Icon */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center text-4xl">
              📦
            </div>
          </div>

          {/* Resource Info */}
          <div className="flex-1 space-y-3">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text)] mb-2">
                {resource.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {resource.username || 'Unknown'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(resource.created_at).toLocaleDateString()}
                </span>
                {resource.category_name && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    {resource.category_name}
                  </span>
                )}
              </div>
            </div>

            {resource.description && (
              <p className="text-[var(--text-secondary)]">
                {resource.description}
              </p>
            )}
          </div>

          {/* Download Button */}
          <div className="flex-shrink-0">
            <button className="px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white rounded-lg font-medium flex items-center gap-2 transition-colors">
              <Download className="w-5 h-5" />
              下载资源
            </button>
            <div className="text-sm text-[var(--text-muted)] text-center mt-2">
              {resource.download_count || 0} 次下载
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-[var(--border)]">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 relative ${
                  activeTab === tab.id
                    ? 'text-[var(--primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content with Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {activeTab === 'overview' && <ResourceOverview resource={resource} />}
          {activeTab === 'updates' && <ResourceUpdates resource={resource} />}
          {activeTab === 'reviews' && <ResourceReviews resource={resource} />}
          {activeTab === 'versions' && <ResourceVersions resource={resource} />}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Metadata Card */}
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4 space-y-3">
            <h3 className="font-semibold text-[var(--text)] flex items-center gap-2">
              <Clock className="w-4 h-4" />
              资源信息
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">创建时间</span>
                <span className="text-[var(--text)]">
                  {new Date(resource.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">更新时间</span>
                <span className="text-[var(--text)]">
                  {new Date(resource.updated_at).toLocaleDateString()}
                </span>
              </div>
              {resource.version && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">当前版本</span>
                  <span className="text-[var(--text)]">{resource.version}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">下载次数</span>
                <span className="text-[var(--text)]">{resource.download_count || 0}</span>
              </div>
            </div>
          </div>

          {/* Rating Card */}
          {resource.rating_average && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
              <h3 className="font-semibold text-[var(--text)] flex items-center gap-2 mb-3">
                <Star className="w-4 h-4" />
                评分
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= resource.rating_average!
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-[var(--border)]'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-bold text-[var(--text)]">
                  {resource.rating_average.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
