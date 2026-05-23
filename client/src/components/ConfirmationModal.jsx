import { AlertCircle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';

const TONE_CLASSES = {
  danger:  'bg-red-100 text-red-600',
  warning: 'bg-amber-100 text-amber-600',
  info:    'bg-blue-100 text-blue-600',
  success: 'bg-emerald-100 text-emerald-600',
};

const TONE_TO_BUTTON_VARIANT = {
  danger:  'danger',
  warning: 'primary',
  info:    'primary',
  success: 'success',
};

export default function ConfirmationModal({
  isOpen, onClose, onConfirm,
  title, message,
  confirmText = 'Confirm', cancelText = 'Cancel',
  isDanger = false,
  tone, // 'danger' | 'warning' | 'info' | 'success' — overrides isDanger
  icon: Icon = AlertCircle,
}) {
  const effectiveTone = tone ?? (isDanger ? 'danger' : 'success');
  const iconClasses   = TONE_CLASSES[effectiveTone] ?? TONE_CLASSES.success;
  const buttonVariant = TONE_TO_BUTTON_VARIANT[effectiveTone] ?? 'primary';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
          <Button
            variant={buttonVariant}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full flex-shrink-0 ${iconClasses}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
