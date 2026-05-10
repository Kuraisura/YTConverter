'use client';

import React from 'react';

interface Props {
  progress?: number; // 0-100. If undefined or null, show indeterminate
  className?: string;
}

export default function IndeterminateProgress({ progress, className }: Props) {
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : undefined;

  if (typeof pct === 'number') {
    return (
      <div className={`progress-container ${className || ''}`}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
    );
  }

  // Indeterminate
  return (
    <div className={`indeterminate-wrapper ${className || ''}`}>
      <div className="indeterminate-stripe" />
    </div>
  );
}
