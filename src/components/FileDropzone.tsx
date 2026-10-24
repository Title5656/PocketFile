import { useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FileImage, UploadCloud } from 'lucide-react';

interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  title: string;
  description: string;
  onFiles: (files: File[]) => void;
  maxSizeBytes?: number;
  compact?: boolean;
  disabled?: boolean;
}

function matchesAccept(file: File, accept: string): boolean {
  const rules = accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0 || rules.includes('*/*')) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function FileDropzone({
  accept,
  multiple = false,
  title,
  description,
  onFiles,
  maxSizeBytes,
  compact = false,
  disabled = false,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const receiveFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setError('');
    if (files.length === 0) return;
    const selected = multiple ? files : files.slice(0, 1);
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      if (file.size === 0) rejected.push(`${file.name}: ไฟล์ว่าง`);
      else if (maxSizeBytes && file.size > maxSizeBytes) rejected.push(`${file.name}: ไฟล์ใหญ่เกินกำหนด`);
      else if (!matchesAccept(file, accept)) rejected.push(`${file.name}: รูปแบบไฟล์ไม่รองรับ`);
      else accepted.push(file);
    }
    if (accepted.length > 0) onFiles(accepted);
    if (rejected.length > 0) {
      setError(accepted.length > 0
        ? `ข้าม ${rejected.length} ไฟล์ที่ว่าง ใหญ่เกินไป หรือรูปแบบไม่รองรับ`
        : 'ไฟล์นี้ไม่ได้อยู่ในรูปแบบที่รองรับ หรือเป็นไฟล์ว่าง');
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) receiveFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  return (
    <div
      className={`dropzone${compact ? ' dropzone--compact' : ''}${dragging ? ' dropzone--dragging' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (disabled) setError('รอให้งานปัจจุบันเสร็จก่อนเพิ่มไฟล์'); else receiveFiles(event.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        aria-label="เลือกไฟล์"
        disabled={disabled}
        accept={accept}
        multiple={multiple}
        onChange={handleInput}
        className="visually-hidden"
      />
      <span className="dropzone-icon"><UploadCloud size={22} /></span>
      <div className="dropzone-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="dropzone-actions">
        <button className="button button--primary" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <FileImage size={16} /> เลือกไฟล์
        </button>
        {!compact ? <small>หรือวางไฟล์ไว้ที่นี่</small> : null}
      </div>
      {error ? <p className="dropzone-error" role="alert">{error}</p> : null}
    </div>
  );
}
