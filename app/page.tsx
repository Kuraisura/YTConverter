'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HeadphonesIcon,
  Film01Icon,
  Download01Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Rotate01Icon,
  Share01Icon,
} from 'hugeicons-react';
import { useConversion } from '@/lib/hooks/useConversion';
import { useIsMobile } from '@/components/ui/use-mobile';

const processingMessages = [
  'Analyzing media...',
  'Extracting metadata...',
  'Converting format...',
  'Optimizing quality...',
  'Preparing download...',
  'Almost there...',
];

const audioQualityOptions = [
  { value: '128', label: '128 kbps - Standard Quality' },
  { value: '192', label: '192 kbps - High Quality' },
  { value: '256', label: '256 kbps - Better Quality' },
  { value: '320', label: '320 kbps - Maximum Quality' },
];

const videoQualityOptions = [
  { value: '360', label: '360p - Mobile Friendly' },
  { value: '720', label: '720p - HD' },
  { value: '1080', label: '1080p - Full HD' },
];

const MobileStatusPill = ({ state }: { state: string }) => (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: '999px',
    backgroundColor: state === 'PROCESSING' ? 'rgba(255, 79, 79, 0.18)' : 'rgba(255,255,255,0.08)',
    color: state === 'PROCESSING' ? '#ffd4d4' : '#f8fafc',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    border: state === 'PROCESSING' ? '1px solid rgba(255,79,79,0.3)' : '1px solid rgba(255,255,255,0.12)',
  }}>
    {state === 'PROCESSING' ? '● Converting' : state === 'SUCCESS' ? '✓ Ready' : 'Ready'}
  </div>
);

const AnimatedBackground = () => (
  <div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    background: 'radial-gradient(ellipse at 50% 30%, rgba(255,79,79,0.08), transparent 60%)',
    pointerEvents: 'none',
  }}>
    <div style={{
      position: 'absolute',
      top: '10%',
      right: '10%',
      width: '400px',
      height: '400px',
      background: 'radial-gradient(circle, rgba(255, 63, 63, 0.06), transparent)',
      borderRadius: '50%',
      filter: 'blur(80px)',
    }} />
    <div style={{
      position: 'absolute',
      bottom: '5%',
      left: '5%',
      width: '300px',
      height: '300px',
      background: 'radial-gradient(circle, rgba(59, 130, 246, 0.04), transparent)',
      borderRadius: '50%',
      filter: 'blur(80px)',
    }} />
  </div>
);

const styles = {
  container: {
    minHeight: '100vh',
    padding: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    zIndex: 10,
    overflow: 'hidden',
    fontFamily: 'var(--font-orbitron)',
  },
  pageShell: {
    width: '100%',
    maxWidth: '1160px',
    display: 'grid',
    gap: '30px',
    zIndex: 5,
  },
  heroSection: {
    display: 'grid',
    gap: '18px',
    padding: '32px 28px',
    background: 'rgba(10, 10, 10, 0.88)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: '32px',
    boxShadow: '0 40px 120px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(18px)',
  },
  title: {
    fontSize: 'clamp(3rem, 5vw, 5.2rem)',
    fontWeight: 900,
    lineHeight: 1.02,
    letterSpacing: '-0.04em',
    wordSpacing: '0.15em',
    fontFamily: 'var(--font-orbitron)',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: '28px',
  },
  consolePanel: {
    background: 'rgba(12, 12, 12, 0.94)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: '32px',
    padding: '32px',
    boxShadow: '0 40px 120px rgba(0, 0, 0, 0.3)',
    display: 'grid',
    gap: '24px',
  },
  statusPanel: {
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 0, 0, 0.06))',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: '28px',
    padding: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '14px',
  },
  input: {
    width: '100%',
    padding: '18px 22px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: '20px',
    color: 'white',
    fontSize: '15px',
    fontFamily: 'var(--font-orbitron)',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.35)',
  },
  label: {
    fontSize: '0.78rem',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.16em',
    fontFamily: 'var(--font-orbitron)',
  },
  button: {
    padding: '16px 24px',
    borderRadius: '18px',
    fontWeight: 700,
    fontSize: '0.95rem',
    fontFamily: 'var(--font-orbitron)',
    transition: 'all 0.22s ease',
    cursor: 'pointer',
    border: 'none',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #ff3f3f, #ff6464)',
    color: 'white',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxShadow: '0 24px 48px rgba(255, 64, 64, 0.24)',
  },
  secondaryButton: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: 'white',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    backdropFilter: 'blur(15px)',
  },
  formatGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
  },
  optionCard: {
    borderRadius: '24px',
    padding: '18px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '72px',
  },
  panelCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: '28px',
    padding: '28px',
    boxShadow: '0 40px 80px rgba(0, 0, 0, 0.22)',
    backdropFilter: 'blur(18px)',
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '24px',
    minHeight: '180px',
    display: 'grid',
    gap: '14px',
    boxShadow: '0 30px 60px rgba(0,0,0,0.14)',
  },
  featureTitle: {
    fontSize: '1rem',
    fontWeight: 800,
    color: 'white',
    marginTop: '10px',
  },
  featureDescription: {
    fontSize: '0.95rem',
    color: '#cbd5e1',
    lineHeight: 1.8,
  },
  smallText: {
    fontSize: '0.88rem',
    color: '#9ca3af',
  },
  titleYou: {
    fontFamily: 'var(--font-orbitron)',
    fontSize: 'clamp(2.5rem, 4vw, 4.8rem)',
    fontWeight: 900,
  },
  titleTube: {
    fontFamily: 'var(--font-orbitron)',
    fontSize: 'clamp(2.5rem, 4vw, 4.8rem)',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #ff3f3f, #ff6464)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent',
  },
  titleRest: {
    fontFamily: 'var(--font-orbitron)',
    fontSize: 'clamp(2.5rem, 4vw, 4.8rem)',
    fontWeight: 900,
  },
};

export default function Home() {
  const isMobile = useIsMobile();
  const {
    state,
    url,
    format,
    audioQuality,
    videoQuality,
    job,
    error,
    isValidUrl,
    handleUrlChange,
    startConversion,
    confirmSelection,
    reset,
    setFormat,
    setAudioQuality,
    setVideoQuality,
    mode,
    setMode,
    markDownloaded,
    firstProgressUpdateAt,
  } = useConversion();

  const [configError, setConfigError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(true);
  const [isActionSheetExpanded, setIsActionSheetExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state !== 'processing') return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % processingMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('Health check failed');
        }
        setConfigError(null);
      } catch (err) {
        setConfigError('Configuration Issue: Upstash Redis or R2 credentials may be missing or the API is unavailable.');
      }
    };
    checkConfig();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'download';
  };

  const getDownloadFilename = () => {
    const savedName = job?.filename || job?.metadata?.title || 'youtube';
    const safeName = sanitizeFilename(savedName);
    if (safeName.endsWith('.mp3') || safeName.endsWith('.mp4') || safeName.endsWith('.zip')) {
      return safeName;
    }
    if (job?.isPlaylist) {
      return `${safeName}.zip`;
    }
    return `${safeName}.${format}`;
  };

  const storageInfoText = mode === 'playlist'
    ? 'Playlist max size: 3 GB'
    : format === 'mp3'
      ? 'Audio max size: 1 GB'
      : 'Video max size: 3 GB';

  const storageInfoTone = mode === 'playlist' || format === 'mp4'
    ? '#dbeafe'
    : '#dbeafe';

  const awaitingFirstProgress =
    state === 'processing' &&
    job?.status === 'queued' &&
    job.progress === 0 &&
    typeof firstProgressUpdateAt === 'number' &&
    currentTime < firstProgressUpdateAt;

  const firstProgressFallback =
    state === 'processing' &&
    job?.status === 'queued' &&
    job.progress === 0 &&
    typeof firstProgressUpdateAt === 'number' &&
    currentTime >= firstProgressUpdateAt;

  const progressCallout = (() => {
    if (firstProgressFallback) {
      return 'Processing started, waiting for first progress update...';
    }

    if (awaitingFirstProgress) {
      return 'Waiting for available resources...';
    }

    if (job?.status === 'processing') {
      if (job.progress <= 20) {
        return job.statusMessage || 'Conversion started, downloading media...';
      }

      return job.statusMessage || 'Processing your file...';
    }

    if (job?.status === 'completed') {
      return 'Finalizing download...';
    }

    return 'Waiting for available resources...';
  })();

  const downloadFile = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!job?.id) return;

    const filename = getDownloadFilename();

    try {
      const response = await fetch(`/api/download?jobId=${job.id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const cleanupResponse = await fetch(`/api/cleanup?jobId=${job.id}`, { method: 'DELETE' });
      if (cleanupResponse.ok) {
        markDownloaded();
      } else {
        console.warn('Cleanup failed after download', await cleanupResponse.text());
      }
    } catch (err) {
      console.error('Download button failed:', err);
      alert('Download failed. Please try again.');
    }
  };

  if (isMobile) {
    const isSmallPhone = typeof window !== 'undefined' && window.innerWidth < 430;

    const mobileShellStyle = {
      minHeight: '100vh',
      padding: isSmallPhone ? '10px 10px 238px' : '14px 14px 254px',
      position: 'relative' as const,
      zIndex: 10,
      overflow: 'hidden',
      fontFamily: 'var(--font-orbitron)',
    };

    const mobileCardStyle = {
      background: 'linear-gradient(180deg, rgba(20, 20, 22, 0.96), rgba(10, 10, 12, 0.92))',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'rgba(255,255,255,0.09)',
      borderRadius: isSmallPhone ? '20px' : '26px',
      padding: isSmallPhone ? '14px' : '18px',
      boxShadow: '0 30px 60px rgba(0, 0, 0, 0.28)',
      backdropFilter: 'blur(16px)',
      display: 'grid',
      gap: isSmallPhone ? '12px' : '14px',
      fontFamily: 'var(--font-orbitron)',
    };

    const mobileInputStyle = {
      ...styles.input,
      padding: isSmallPhone ? '17px 16px' : '16px 16px',
      fontSize: isSmallPhone ? '13px' : '14px',
      borderRadius: '18px',
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    };

    const mobileButtonStyle = {
      ...styles.button,
      minHeight: isSmallPhone ? '60px' : '56px',
      fontSize: isSmallPhone ? '0.9rem' : '0.92rem',
      borderRadius: '18px',
    };

    const mobileHeroCardStyle = {
      ...mobileCardStyle,
      background: 'linear-gradient(135deg, rgba(255, 63, 63, 0.18), rgba(12, 12, 14, 0.96) 55%, rgba(255, 63, 63, 0.08))',
      borderColor: 'rgba(255, 92, 92, 0.18)',
      gap: isSmallPhone ? '10px' : '12px',
    };

    const mobileSheetStyle = {
      position: 'fixed' as const,
      left: isSmallPhone ? '10px' : '14px',
      right: isSmallPhone ? '10px' : '14px',
      bottom: isSmallPhone ? '10px' : '14px',
      maxWidth: '560px',
      margin: '0 auto',
      zIndex: 22,
      background: 'linear-gradient(180deg, rgba(18, 18, 22, 0.98), rgba(9, 9, 11, 0.98) 55%, rgba(14, 14, 18, 0.98))',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'rgba(255,255,255,0.09)',
      borderRadius: '26px 26px 22px 22px',
      boxShadow: '0 -24px 60px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(18px)',
      overflow: 'hidden',
      fontFamily: 'var(--font-orbitron)',
    };

    const mobileSheetInnerStyle = {
      display: 'grid',
      gap: isSmallPhone ? '10px' : '12px',
      padding: isSmallPhone ? '12px' : '14px',
      maxHeight: isActionSheetExpanded
        ? isSmallPhone
          ? 'calc(100vh - 280px)'
          : 'calc(100vh - 300px)'
        : isSmallPhone
          ? 'calc(100vh - 420px)'
          : 'calc(100vh - 440px)',
      overflowY: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as const,
    };

    const mobileOptionStyle = {
      ...styles.optionCard,
      minHeight: isSmallPhone ? '68px' : '60px',
      borderRadius: '18px',
    };

    const mobileJourney = [
      { key: 'idle', label: 'Paste' },
      { key: 'selection', label: 'Choose' },
      { key: 'processing', label: 'Convert' },
      { key: 'success', label: 'Download' },
    ] as const;

    const activeJourneyIndex = state === 'idle' ? 0 : state === 'selection' ? 1 : state === 'processing' ? 2 : 3;

    const handleActionSheetDragEnd = (_event: any, info: PanInfo) => {
      if (info.offset.y < -40) {
        setIsActionSheetExpanded(true);
        setIsActionSheetOpen(true);
        return;
      }

      if (info.offset.y > 40) {
        setIsActionSheetExpanded(false);
      }
    };

    return (
      <div className="app-page-container" style={mobileShellStyle}>
        <AnimatedBackground />

        <AnimatePresence>
          {configError && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                marginBottom: '12px',
                backgroundColor: 'rgba(127, 29, 29, 0.22)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '18px',
                backdropFilter: 'blur(10px)',
                padding: '14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <AlertCircleIcon size={20} style={{ color: '#ff0000', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontFamily: 'var(--font-sans)', fontSize: '0.95rem' }}>Configuration Alert</h3>
                <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>{configError}</p>
              </div>
              <button onClick={() => setConfigError(null)} style={{ color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}>
                <Cancel01Icon size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ position: 'relative', zIndex: 5, maxWidth: '560px', margin: '0 auto', display: 'grid', gap: '14px' }}>
          <div style={mobileHeroCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <p style={{ ...styles.label, fontSize: '0.68rem' }}>Pocket mode</p>
                <h1 style={{ color: 'white', fontSize: isSmallPhone ? '1.45rem' : '1.8rem', lineHeight: 1.05, marginTop: '6px', fontFamily: 'var(--font-orbitron)', letterSpacing: '0.02em' }}>
                  <span>You</span><span>Tube </span><span>To MP4 & MP3</span>
                </h1>
              </div>
              <MobileStatusPill state={state.toUpperCase()} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
              <span style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.78rem', border: '1px solid rgba(255,255,255,0.08)' }}>One-hand friendly</span>
              <span style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(255,63,63,0.12)', color: '#ffd4d4', fontSize: '0.78rem', border: '1px solid rgba(255,63,63,0.18)' }}>Quick convert</span>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: isSmallPhone ? '0.86rem' : '0.92rem', lineHeight: 1.5 }}>
              A pocket-sized conversion flow built for thumbs, quick glances, and short interactions.
            </p>
          </div>

          <div style={{ ...mobileCardStyle, gap: isSmallPhone ? '10px' : '12px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Paste YouTube URL..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                style={{
                  ...mobileInputStyle,
                  borderColor: url && !isValidUrl ? '#ff3f3f' : url && isValidUrl ? '#22c55e' : 'rgba(255, 255, 255, 0.12)',
                  paddingRight: url ? '48px' : '16px',
                }}
              />
              {url && (
                <div style={{ position: 'absolute', right: isSmallPhone ? '12px' : '14px', top: '50%', transform: 'translateY(-50%)' }}>
                  {isValidUrl ? (
                    <CheckmarkCircle01Icon size={18} style={{ color: '#22c55e' }} />
                  ) : (
                    <AlertCircleIcon size={18} style={{ color: '#ff3f3f' }} />
                  )}
                </div>
              )}
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#ff6b6b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                <AlertCircleIcon size={16} strokeWidth={2} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>{error}</span>
              </motion.div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={styles.label}>Source</div>
              <div style={{ display: 'grid', gridTemplateColumns: isSmallPhone ? '1fr' : '1fr 1fr', gap: isSmallPhone ? '8px' : '10px' }}>
                {[
                  { id: 'individual', icon: HeadphonesIcon, label: 'Individual' },
                  { id: 'playlist', icon: Film01Icon, label: 'Playlist' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id as 'individual' | 'playlist')}
                    style={{
                      ...mobileOptionStyle,
                      borderRadius: '18px',
                      borderColor: mode === option.id ? '#ff4f4f' : 'rgba(255, 255, 255, 0.08)',
                      backgroundColor: mode === option.id ? 'rgba(255, 79, 79, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                      color: 'white',
                      padding: isSmallPhone ? '14px 10px' : '18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                      <option.icon size={16} strokeWidth={2} />
                      <span style={{ fontSize: isSmallPhone ? '0.84rem' : '0.9rem', fontFamily: 'var(--font-orbitron)' }}>{option.label}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={styles.label}>Format</div>
                <div style={{ display: 'grid', gridTemplateColumns: isSmallPhone ? '1fr' : '1fr 1fr', gap: isSmallPhone ? '8px' : '10px' }}>
                  {[
                    { id: 'mp3', icon: HeadphonesIcon, label: 'Audio' },
                    { id: 'mp4', icon: Film01Icon, label: 'Video' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormat(option.id as 'mp3' | 'mp4')}
                      style={{
                        ...mobileOptionStyle,
                        borderRadius: '18px',
                        borderColor: format === option.id ? '#ff4f4f' : 'rgba(255, 255, 255, 0.08)',
                        backgroundColor: format === option.id ? 'rgba(255, 79, 79, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                        color: 'white',
                        padding: isSmallPhone ? '14px 10px' : '18px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                        <option.icon size={16} strokeWidth={2} />
                        <span style={{ fontSize: isSmallPhone ? '0.84rem' : '0.9rem', fontFamily: 'var(--font-orbitron)' }}>{option.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {format === 'mp3' ? (
                  <div>
                    <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Bitrate</label>
                    <Select value={audioQuality} onValueChange={setAudioQuality}>
                      <SelectTrigger className="w-full h-[54px] rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)] data-[state=open]:border-[#ff4f4f] data-[state=open]:shadow-[0_0_0_1px_rgba(255,79,79,0.18),0_20px_40px_rgba(0,0,0,0.35)]" style={{ fontFamily: 'var(--font-orbitron)' }}>
                        <SelectValue placeholder="Select bitrate" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#111111] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                        {audioQualityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="rounded-md px-3 py-2.5 text-sm text-white data-[highlighted]:bg-[rgba(255,79,79,0.15)] data-[highlighted]:text-white data-[state=checked]:bg-[rgba(255,79,79,0.2)]" style={{ fontFamily: 'var(--font-orbitron)' }}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Resolution</label>
                    <Select value={videoQuality} onValueChange={setVideoQuality}>
                      <SelectTrigger className="w-full h-[54px] rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)] data-[state=open]:border-[#ff4f4f] data-[state=open]:shadow-[0_0_0_1px_rgba(255,79,79,0.18),0_20px_40px_rgba(0,0,0,0.35)]" style={{ fontFamily: 'var(--font-orbitron)' }}>
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#111111] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                        {videoQualityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="rounded-md px-3 py-2.5 text-sm text-white data-[highlighted]:bg-[rgba(255,79,79,0.15)] data-[highlighted]:text-white data-[state=checked]:bg-[rgba(255,79,79,0.2)]" style={{ fontFamily: 'var(--font-orbitron)' }}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div style={{
                borderRadius: '18px',
                padding: '14px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <p style={{ color: '#93c5fd', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '6px', fontFamily: 'var(--font-orbitron)' }}>Storage Info</p>
                <p style={{ color: '#dbeafe', fontSize: '0.9rem', marginBottom: '4px', fontFamily: 'var(--font-orbitron)' }}>{storageInfoText}</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'var(--font-orbitron)' }}>{mode === 'playlist' ? 'Playlist size limit.' : format === 'mp3' ? 'Audio size limit.' : 'Video size limit.'}</p>
              </div>

              {!job && (
                <button
                  type="button"
                  onClick={startConversion}
                  disabled={!isValidUrl}
                  style={{
                    ...mobileButtonStyle,
                    ...styles.primaryButton,
                    opacity: isValidUrl ? 1 : 0.55,
                    cursor: isValidUrl ? 'pointer' : 'not-allowed',
                    position: 'sticky',
                    bottom: '12px',
                    zIndex: 15,
                  }}
                >
                  Fetch Metadata
                </button>
              )}
            </div>
          </div>

          {job?.metadata?.thumbnail && (
            <div style={mobileCardStyle}>
              <img
                src={job.metadata.thumbnail}
                alt={job.metadata.title || 'YouTube thumbnail'}
                style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '16px' }}
              />
              <div>
                <p style={{ ...styles.label, marginBottom: '8px' }}>Now processing</p>
                <p style={{ color: 'white', fontWeight: 700, fontSize: '1rem', lineHeight: 1.35 }}>{job.metadata.title || 'Untitled video'}</p>

                {state === 'processing' && job && (
                  <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                    <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(job.progress ?? 0, 100)}%`, background: 'linear-gradient(90deg, #ff8a8a, #ff4f4f)', transition: 'width 300ms ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: '0.85rem' }}>
                      <span>{job.status === 'queued' ? 'Queued' : `${Math.round(job.progress ?? 0)}%`}</span>
                      <span style={{ maxWidth: '70%', textAlign: 'right' }}>{progressCallout}</span>
                    </div>
                  </div>
                )}

                {state === 'success' && job && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {job.fileUrl ? (
                      <button onClick={downloadFile} style={{ ...mobileButtonStyle, ...styles.primaryButton }}>
                        <Download01Icon size={18} strokeWidth={2} />
                        Download file
                      </button>
                    ) : (
                      <div style={{ color: '#9ca3af' }}>Download will appear here when ready.</div>
                    )}
                    <button onClick={reset} style={{ ...mobileButtonStyle, ...styles.secondaryButton }}>
                      <Rotate01Icon size={18} strokeWidth={2} />
                      Convert another
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

          <div style={{ ...mobileCardStyle, gap: isSmallPhone ? '10px' : '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
              {mobileJourney.map((step, index) => {
                const isActive = index === activeJourneyIndex;
                const isBehind = index < activeJourneyIndex;

                return (
                  <div
                    key={step.key}
                    style={{
                      borderRadius: '14px',
                      padding: '8px 6px',
                      border: `1px solid ${isActive ? 'rgba(255,79,79,0.32)' : 'rgba(255,255,255,0.07)'}`,
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(255,79,79,0.22), rgba(255,79,79,0.08))'
                        : isBehind
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(255,255,255,0.025)',
                      color: 'white',
                      textAlign: 'center',
                      boxShadow: isActive ? '0 10px 24px rgba(255,79,79,0.12)' : 'none',
                    }}
                  >
                    <p style={{ fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: isActive ? '#ffd4d4' : '#9ca3af', marginBottom: '4px', fontFamily: 'var(--font-orbitron)' }}>
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <p style={{ fontSize: '0.76rem', fontWeight: 700, color: isActive ? 'white' : isBehind ? '#dbeafe' : '#cbd5e1', fontFamily: 'var(--font-orbitron)' }}>{step.label}</p>
                  </div>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
                    {state === 'idle' && (
                      <motion.div key="mobile-idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        <p style={{ ...styles.label, marginBottom: '10px', fontFamily: 'var(--font-orbitron)' }}>How it works</p>
                        <div style={{ display: 'grid', gap: '12px' }}>
                          {[
                            'Paste a YouTube link',
                            'Choose audio or video',
                            'Pick your quality',
                            'Download and enjoy',
                          ].map((item) => (
                            <div key={item} style={{ padding: '12px 14px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '0.92rem', fontFamily: 'var(--font-orbitron)' }}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {state === 'selection' && job && (
                      <motion.div key="mobile-selection" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'grid', gap: '12px' }}>
                        <p style={{ ...styles.label, marginBottom: '2px', fontFamily: 'var(--font-orbitron)' }}>Ready to convert</p>
                        <p style={{ color: 'white', fontWeight: 700, fontSize: '1.02rem', lineHeight: 1.35 }}>{job.metadata?.title || 'Untitled video'}</p>
                        <p style={styles.smallText}>{job.metadata?.author || 'Unknown channel'}</p>
                        <button onClick={confirmSelection} style={{ ...mobileButtonStyle, ...styles.primaryButton }}>
                          Convert now
                        </button>
                      </motion.div>
                    )}

                    {state === 'processing' && job && (
                      <motion.div key="mobile-processing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'grid', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'white', fontWeight: 700, fontFamily: 'var(--font-orbitron)' }}>Progress</span>
                          <span style={{ color: '#9ca3af', fontFamily: 'var(--font-orbitron)' }}>{job.status === 'queued' ? 'Queued' : `${Math.round(job.progress)}%`}</span>
                        </div>
                        <div className="indeterminate-wrapper" style={{ height: '10px' }}>
                          {job.progress === 0 && job.status === 'queued' ? (
                            <div className="indeterminate-stripe" />
                          ) : (
                            <div className="progress-bar" style={{ width: `${Math.min(job.progress, 95)}%` }} />
                          )}
                        </div>
                        <p style={{ color: '#dbeafe', fontSize: '0.92rem', lineHeight: 1.5, fontFamily: 'var(--font-orbitron)' }}>{progressCallout}</p>
                        <p style={{ ...styles.smallText, fontFamily: 'var(--font-orbitron)' }}>{job.statusMessage || 'Processing your file...'}</p>
                      </motion.div>
                    )}

                    {state === 'success' && job && (
                      <motion.div key="mobile-success" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'grid', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <CheckmarkCircle01Icon size={34} strokeWidth={2} style={{ color: '#ff5f5f' }} />
                          <div>
                            <p style={{ ...styles.label, marginBottom: '4px', fontFamily: 'var(--font-orbitron)' }}>Completed</p>
                            <p style={{ color: 'white', fontWeight: 700, fontSize: '1rem', fontFamily: 'var(--font-orbitron)' }}>Download is ready</p>
                          </div>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '18px', background: 'rgba(255,255,255,0.04)', color: '#dbeafe', fontFamily: 'var(--font-orbitron)' }}>
                          {job.fileSize ? formatFileSize(job.fileSize) : 'Unknown size'}
                        </div>
                        {job.fileUrl && (
                          <button onClick={downloadFile} style={{ ...mobileButtonStyle, ...styles.primaryButton }}>
                            <Download01Icon size={18} strokeWidth={2} />
                            Download file
                          </button>
                        )}
                        <button onClick={reset} style={{ ...mobileButtonStyle, ...styles.secondaryButton }}>
                          <Rotate01Icon size={18} strokeWidth={2} />
                          Convert another
                        </button>
                      </motion.div>
                    )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-container" style={styles.container}>
      <AnimatedBackground />
      <AnimatePresence>
        {configError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: 'rgba(127, 29, 29, 0.2)',
              borderBottom: '1px solid #1a1a1a',
              backdropFilter: 'blur(8px)',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
            }}
          >
            <AlertCircleIcon size={24} style={{ color: '#ff0000', flexShrink: 0, marginTop: '4px' }} />
            <div style={{ flex: 1 }}>
              <h3 style={{ color: 'white', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Configuration Alert</h3>
              <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>{configError}</p>
            </div>
            <button onClick={() => setConfigError(null)} style={{ color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}>
              <Cancel01Icon size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="app-page-shell" style={styles.pageShell}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="app-hero-section" style={styles.heroSection}>
          <h1 style={{ ...styles.title, letterSpacing: '0.02em' }}>
            <span style={styles.titleYou}>You</span>
            <span style={styles.titleTube}>Tube</span>
            <span style={styles.titleRest}>To MP4 & MP3</span>
          </h1>
        </motion.div>

        <div className="app-main-grid" style={styles.mainGrid}>
          <div className="app-console-panel" style={styles.consolePanel}>
            <div className="app-status-panel" style={styles.statusPanel}>
              <div>
                <p style={{ color: '#e2e8f0', fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>System status</p>
                <p style={{ color: 'white', fontSize: '1rem', fontWeight: 700 }}>{state === 'idle' ? 'Ready to convert' : state === 'fetching' ? 'Fetching metadata' : state === 'selection' ? 'Awaiting your choice' : state === 'processing' ? 'Processing your file' : 'Download is ready'}</p>
              </div>
              {state === 'success' && job?.fileUrl ? (
                <motion.button onClick={downloadFile} style={{ ...styles.button, ...styles.primaryButton, padding: '12px 18px 12px 20px', width: 'auto', textDecoration: 'none' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Download01Icon size={18} strokeWidth={2} />
                  Download is ready
                </motion.button>
              ) : (
                <span style={styles.statusPill}>{state.toUpperCase()}</span>
              )}
            </div>

            <div style={{ display: 'grid', gap: '18px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Paste YouTube URL..."
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  style={{
                    ...styles.input,
                    borderColor: url && !isValidUrl ? '#ff3f3f' : url && isValidUrl ? '#22c55e' : 'rgba(255, 255, 255, 0.12)',
                    paddingRight: url ? '48px' : '24px',
                  }}
                />
                {url && (
                  <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)' }}>
                    {isValidUrl ? (
                      <CheckmarkCircle01Icon size={20} style={{ color: '#22c55e' }} />
                    ) : (
                      <AlertCircleIcon size={20} style={{ color: '#ff3f3f' }} />
                    )}
                  </div>
                )}
              </div>
              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff6b6b', fontSize: '0.92rem' }}>
                  <AlertCircleIcon size={16} strokeWidth={2} />
                  {error}
                </motion.div>
              )}

              <div style={styles.label}>Source</div>
              <div style={styles.formatGrid}>
                {[
                  { id: 'individual', icon: HeadphonesIcon, label: 'Individual' },
                  { id: 'playlist', icon: Film01Icon, label: 'Playlist' },
                ].map((option) => (
                  <motion.button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id as 'individual' | 'playlist')}
                    style={{
                      ...styles.optionCard,
                      borderColor: mode === option.id ? '#ff4f4f' : 'rgba(255, 255, 255, 0.08)',
                      boxShadow: mode === option.id ? '0 0 36px rgba(255, 79, 79, 0.22)' : 'none',
                      backgroundColor: mode === option.id ? 'rgba(255, 79, 79, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                      color: 'white',
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      <option.icon size={18} strokeWidth={2} />
                      <span>{option.label}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
              <p style={styles.smallText}>{mode === 'playlist' ? 'Convert the whole playlist into a ZIP archive.' : 'Convert only the given video URL.'}</p>
              <p className="app-zip-note" style={{ color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.6, marginTop: '4px' }}>
                Playlist downloads are delivered as a single ZIP archive. This saves storage and keeps your files grouped.
              </p>

              <div style={styles.label}>Format</div>
              <div style={styles.formatGrid}>
                {[
                  { id: 'mp3', icon: HeadphonesIcon, label: 'MP3 Audio' },
                  { id: 'mp4', icon: Film01Icon, label: 'MP4 Video' },
                ].map((option) => (
                  <motion.button
                    key={option.id}
                    type="button"
                    onClick={() => setFormat(option.id as 'mp3' | 'mp4')}
                    style={{
                      ...styles.optionCard,
                      borderColor: format === option.id ? '#ff4f4f' : 'rgba(255, 255, 255, 0.08)',
                      boxShadow: format === option.id ? '0 0 36px rgba(255, 79, 79, 0.22)' : 'none',
                      backgroundColor: format === option.id ? 'rgba(255, 79, 79, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                      color: 'white',
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      <option.icon size={18} strokeWidth={2} />
                      <span>{option.label}</span>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {format === 'mp3' ? (
                  <div>
                    <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Bitrate</label>
                    <Select value={audioQuality} onValueChange={setAudioQuality}>
                      <SelectTrigger
                        className="w-full h-[52px] rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)] data-[state=open]:border-[#ff4f4f] data-[state=open]:shadow-[0_0_0_1px_rgba(255,79,79,0.18),0_20px_40px_rgba(0,0,0,0.35)]"
                      >
                        <SelectValue placeholder="Select bitrate" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#111111] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                        {audioQualityOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="rounded-md px-3 py-2.5 text-sm text-white data-[highlighted]:bg-[rgba(255,79,79,0.15)] data-[highlighted]:text-white data-[state=checked]:bg-[rgba(255,79,79,0.2)]"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Resolution</label>
                    <Select value={videoQuality} onValueChange={setVideoQuality}>
                      <SelectTrigger
                        className="w-full h-[52px] rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-[rgba(255,255,255,0.08)] data-[state=open]:border-[#ff4f4f] data-[state=open]:shadow-[0_0_0_1px_rgba(255,79,79,0.18),0_20px_40px_rgba(0,0,0,0.35)]"
                      >
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#111111] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                        {videoQualityOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="rounded-md px-3 py-2.5 text-sm text-white data-[highlighted]:bg-[rgba(255,79,79,0.15)] data-[highlighted]:text-white data-[state=checked]:bg-[rgba(255,79,79,0.2)]"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {job?.metadata && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: mode === 'playlist' && job.metadata.itemCount && job.metadata.itemCount * 50 > 1073741824 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: mode === 'playlist' && job.metadata.itemCount && job.metadata.itemCount * 50 > 1073741824 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                }}>
                  <p style={{ color: mode === 'playlist' && job.metadata.itemCount && job.metadata.itemCount * 50 > 1073741824 ? '#fca5a5' : '#93c5fd', fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>
                    Storage Info
                  </p>
                  <p style={{ color: storageInfoTone, fontSize: '0.85rem', marginBottom: '4px' }}>
                    {storageInfoText}
                  </p>
                  {mode === 'playlist' && job.metadata.itemCount ? (
                    <p style={{ color: '#dbeafe', fontSize: '0.85rem', marginBottom: 0 }}>
                      Items: {job.metadata.itemCount}
                    </p>
                  ) : (
                    <p style={{ color: '#dbeafe', fontSize: '0.85rem', marginBottom: 0 }}>
                      {format === 'mp3' ? 'Brief audio download' : 'Brief video download'}
                    </p>
                  )}
                </motion.div>
              )}

              <motion.button
                type="button"
                onClick={startConversion}
                disabled={!isValidUrl}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  opacity: isValidUrl ? 1 : 0.55,
                  cursor: isValidUrl ? 'pointer' : 'not-allowed',
                }}
                whileHover={isValidUrl ? { scale: 1.02 } : {}}
                whileTap={isValidUrl ? { scale: 0.98 } : {}}
              >
                Fetch Metadata
              </motion.button>
            </div>
          </div>

          <div className="app-panel-card" style={styles.panelCard}>
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.div key="idle" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <p style={{ ...styles.label, marginBottom: '12px' }}>How it works</p>
                  <div style={{ display: 'grid', gap: '18px' }}>
                    {[
                      { label: 'Paste link', desc: 'Insert any YouTube URL into the input field.' },
                      { label: 'Choose format', desc: 'Select MP3 or MP4 and preferred quality.' },
                      { label: 'Download instantly', desc: 'Receive a ready-to-download file when conversion completes.' },
                    ].map((step) => (
                      <div key={step.label} style={{ display: 'grid', gap: '6px' }}>
                        <p style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>{step.label}</p>
                        <p style={styles.smallText}>{step.desc}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {state === 'fetching' && (
                <motion.div key="fetching" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <p style={{ ...styles.label, marginBottom: '18px' }}>Fetching video details</p>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div style={{ height: '16px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', width: '55%' }} />
                    <div style={{ height: '14px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', width: '40%' }} />
                    <div style={{ height: '220px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '26px' }} />
                    <p style={styles.smallText}>Scanning the video and preparing quality options...</p>
                  </div>
                </motion.div>
              )}

              {state === 'selection' && job && (
                <motion.div key="selection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <div style={{ display: 'grid', gap: '18px' }}>
                    {job.metadata?.thumbnail && (
                      <div style={{ borderRadius: '22px', overflow: 'hidden', borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                        <img
                          src={job.metadata.thumbnail}
                          alt={job.metadata.title || 'YouTube thumbnail'}
                          style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '22px', padding: '18px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <p style={{ ...styles.label, marginBottom: '10px' }}>Ready to convert</p>
                      <p style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{job.metadata?.title || 'Untitled video'}</p>
                      <p style={styles.smallText}>
                        {job.metadata?.author || 'Unknown channel'} · {job.metadata?.isPlaylist
                          ? `${job.metadata?.itemCount ?? 0} items`
                          : typeof job.metadata?.duration === 'number' && job.metadata.duration > 0
                            ? `${Math.floor(job.metadata.duration / 60)}:${String(job.metadata.duration % 60).padStart(2, '0')}`
                            : 'Duration unavailable'}
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <motion.button onClick={reset} style={{ ...styles.button, ...styles.secondaryButton }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Back</motion.button>
                      <motion.button onClick={confirmSelection} style={{ ...styles.button, ...styles.primaryButton }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Convert now</motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {state === 'processing' && job && (
                <motion.div key="processing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <p style={{ ...styles.label, marginBottom: '14px' }}>Processing check</p>
                  <div style={{ display: 'grid', gap: '20px' }}>
                    {job.metadata?.thumbnail && (
                      <div style={{ borderRadius: '22px', overflow: 'hidden', borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                        <img
                          src={job.metadata.thumbnail}
                          alt={job.metadata.title || 'YouTube thumbnail'}
                          style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: 700 }}>Progress</span>
                      <span style={{ color: '#9ca3af' }}>{job.progress === 0 && job.status === 'queued' ? '⏳ Queued' : `${Math.round(job.progress)}%`}</span>
                    </div>
                    <div style={{ height: '12px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                      {job.progress === 0 && job.status === 'queued' ? (
                        <motion.div
                          initial={{ left: '-100%' }}
                          animate={{ left: '100%' }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                          style={{
                            position: 'absolute',
                            height: '100%',
                            width: '30%',
                            backgroundColor: '#ff3f3f',
                            opacity: 0.7,
                            boxShadow: '0 0 20px rgba(255, 63, 63, 0.6)',
                          }}
                        />
                      ) : (
                        <motion.div initial={{ width: '0%' }} animate={{ width: `${Math.min(job.progress, 95)}%` }} transition={{ duration: 0.3 }} style={{ height: '100%', backgroundColor: '#ff3f3f', boxShadow: '0 0 16px rgba(255, 63, 63, 0.5)' }} />
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <p style={styles.smallText}>{job.statusMessage || 'Processing your file...'}</p>
                      {(job.status === 'queued' || job.progress < 30) && (
                        <motion.div
                          initial={{ opacity: 0.6 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          style={{
                            padding: '12px 14px',
                            backgroundColor: 'rgba(59, 130, 246, 0.08)',
                            borderRadius: '12px',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              borderWidth: '2px',
                              borderStyle: 'solid',
                              borderColor: 'rgba(59, 130, 246, 0.3)',
                              borderTopColor: '#3b82f6',
                            }}
                          />
                          <span style={{ fontSize: '0.85rem', color: '#93c5fd' }}>
                            {progressCallout}
                          </span>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {state === 'success' && job && (
                <motion.div key="success" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <div style={{ display: 'grid', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <CheckmarkCircle01Icon size={38} strokeWidth={2} style={{ color: '#ff5f5f' }} />
                      <div>
                        <p style={{ ...styles.label, marginBottom: '6px' }}>Completed</p>
                        <p style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>Your download is ready</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '20px', borderRadius: '22px', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '6px' }}>Format</p>
                        <p style={{ color: 'white', fontWeight: 700 }}>{job.isPlaylist ? 'ZIP' : format.toUpperCase()}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '6px' }}>Size</p>
                        <p style={{ color: 'white', fontWeight: 700 }}>{job.fileSize ? formatFileSize(job.fileSize) : 'Unknown'}</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: job.fileUrl ? '1fr 1fr' : '1fr', gap: '12px' }}>
                      {job.fileUrl ? (
                        <motion.button onClick={downloadFile} style={{ ...styles.button, ...styles.primaryButton, textDecoration: 'none' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Download01Icon size={20} strokeWidth={2} />
                          Download File
                        </motion.button>
                      ) : (
                        <div style={{ padding: '18px', borderRadius: '22px', backgroundColor: 'rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
                          File downloaded and removed from storage to save space.
                        </div>
                      )}
                      {job.fileUrl && (
                        <motion.button
                          onClick={() => {
                            navigator.clipboard.writeText(job.fileUrl ?? '');
                            alert('Download link copied!');
                          }}
                          style={{ ...styles.button, ...styles.secondaryButton }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Share01Icon size={18} strokeWidth={2} />
                          Copy link
                        </motion.button>
                      )}
                    </div>
                    <motion.button onClick={reset} style={{ ...styles.button, ...styles.secondaryButton }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Rotate01Icon size={18} strokeWidth={2} />
                      Convert another
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
