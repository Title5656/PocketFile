import { CheckCircle2, Download, FileCheck2 } from 'lucide-react';
import { formatBytes } from '../lib/format';

interface ResultCardProps {
  title: string;
  filename: string;
  blob: Blob;
  onDownload: (blob: Blob, filename: string) => void;
  warning?: string;
  details?: Array<{ label: string; value: string }>;
}

export function ResultCard({ title, filename, blob, onDownload, warning, details = [] }: ResultCardProps) {
  return (
    <section className="result-card" aria-label="ไฟล์ผลลัพธ์">
      <div className="result-card-status"><CheckCircle2 size={19} /><span>เสร็จแล้ว</span></div>
      <div className="result-card-file">
        <span className="result-file-icon"><FileCheck2 size={21} /></span>
        <div className="result-file-copy">
          <strong>{title}</strong>
          <span>{filename}</span>
        </div>
        <strong className="result-file-size">{formatBytes(blob.size)}</strong>
      </div>
      {details.length > 0 ? (
        <dl className="result-details">
          {details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      ) : null}
      {warning ? <p className="result-warning" role="alert">{warning}</p> : null}
      <button className="button button--primary result-download" type="button" onClick={() => onDownload(blob, filename)}>
        <Download size={16} /> ดาวน์โหลดไฟล์
      </button>
    </section>
  );
}
