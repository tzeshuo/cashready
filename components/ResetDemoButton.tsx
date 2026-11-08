'use client';

import { useState } from 'react';

export default function ResetDemoButton() {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!confirm('Reset demo environment to fresh default state?')) return;
    setResetting(true);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Demo state reset successfully!');
        window.location.reload();
      } else {
        alert(`Reset failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={resetting}
      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-md border border-slate-300 font-medium transition disabled:opacity-50"
      title="Purge transactions and restore default showcase seeds"
    >
      {resetting ? 'Resetting...' : '↻ Reset Demo'}
    </button>
  );
}
