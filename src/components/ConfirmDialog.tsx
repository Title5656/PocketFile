import { Modal } from './Modal';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal className="confirm-dialog" alert labelledBy="confirm-title" describedBy="confirm-message" onClose={onCancel}>
        <button className="dialog-close icon-button" type="button" onClick={onCancel} aria-label="ปิดหน้าต่าง"><X size={18} /></button>
        <span className="dialog-alert-icon"><AlertTriangle size={21} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="dialog-actions">
          <button className="button button--quiet" type="button" onClick={onCancel}>ยกเลิก</button>
          <button className="button button--danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
    </Modal>
  );
}
