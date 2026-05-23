import { AlertCircle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';

export default function ConfirmationModal({
  isOpen, onClose, onConfirm,
  title, message,
  confirmText = 'Confirm', cancelText = 'Cancel',
  isDanger = false,
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      showClose={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full flex-shrink-0 ${isDanger ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
