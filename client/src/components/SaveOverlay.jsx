import { CheckCircle, XCircle } from 'lucide-react';

export default function SaveOverlay({ status, onClose, successMessage = 'Saved!' }) {
  if (!status) return null;
  const isSuccess = status === 'success';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" style={{ animation: 'fadeIn 0.2s ease' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 min-w-[240px]" style={{ animation: 'popIn 0.25s ease' }}>
        {isSuccess
          ? <CheckCircle className="w-16 h-16 text-green-500" style={{ animation: 'scaleIn 0.3s ease' }} />
          : <XCircle     className="w-16 h-16 text-red-500"   style={{ animation: 'scaleIn 0.3s ease' }} />
        }
        <p className="text-lg font-bold text-gray-900">{isSuccess ? successMessage : 'Save Failed'}</p>
        <button onClick={onClose} className="mt-2 px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition">Close</button>
      </div>
    </div>
  );
}
