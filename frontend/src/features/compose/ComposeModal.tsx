import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { Input, Textarea } from '../../components/Input';
import { emailsApi } from '../../utils/api';
import type { EmailSender } from '../../types';
import toast from 'react-hot-toast';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  senders: EmailSender[];
  onScheduled: () => void;
}

function parseEmailsFromText(text: string): string[] {
  // handles csv content or newline-separated emails, strips headers
  const lines = text.split(/[\r\n,]+/);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return lines
    .map((l) => l.trim().toLowerCase())
    .filter((l) => emailRegex.test(l));
}

export default function ComposeModal({ open, onClose, senders, onScheduled }: ComposeModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senderId, setSenderId] = useState(senders[0]?.id || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [delayBetweenSecs, setDelayBetweenSecs] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseEmailsFromText(text);
      setRecipients(parsed);
      setFileInfo(`${file.name} — ${parsed.length} email${parsed.length !== 1 ? 's' : ''} detected`);
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    if (!body.trim()) { toast.error('Body is required'); return; }
    if (recipients.length === 0) { toast.error('Upload a CSV with at least one email'); return; }
    if (!senderId) { toast.error('Select a sender'); return; }
    if (!scheduledAt) { toast.error('Pick a start time'); return; }

    const startDate = new Date(scheduledAt);
    if (startDate <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    setSubmitting(true);
    try {
      const result = await emailsApi.scheduleEmails({
        recipients,
        subject: subject.trim(),
        body: body.trim(),
        senderId,
        scheduledAt: startDate.toISOString(),
        delayBetweenMs: parseFloat(delayBetweenSecs) * 1000,
        ...(hourlyLimit ? { batchMaxPerHour: parseInt(hourlyLimit) } : {}),
      });

      toast.success(`Scheduled ${result.scheduled} emails`);
      onScheduled();
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Scheduling failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSubject('');
    setBody('');
    setSenderId(senders[0]?.id || '');
    setScheduledAt('');
    setDelayBetweenSecs('2');
    setHourlyLimit('');
    setRecipients([]);
    setFileInfo('');
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  }

  // format datetime-local minimum value
  const minDateTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={submitting}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} loading={submitting}>
        Schedule {recipients.length > 0 ? `(${recipients.length})` : ''}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={handleClose} title="Compose New Email" maxWidth="max-w-2xl" footer={footer}>
      <div className="flex flex-col gap-4">
        {/* sender picker */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">From</label>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} &lt;{s.email}&gt;
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Your email subject"
        />

        <Textarea
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Write your email here..."
        />

        {/* csv upload */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Recipients (CSV or TXT)</label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Choose file
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {fileInfo ? (
              <span className="text-sm text-gray-600">{fileInfo}</span>
            ) : (
              <span className="text-sm text-gray-400">No file chosen</span>
            )}
          </div>
          <p className="text-xs text-gray-400">One email per line, or comma-separated</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Start time</label>
            <input
              type="datetime-local"
              min={minDateTime}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <Input
            label="Delay between emails (seconds)"
            type="number"
            min="0.1"
            step="0.1"
            value={delayBetweenSecs}
            onChange={(e) => setDelayBetweenSecs(e.target.value)}
          />

          <Input
            label="Hourly limit (optional)"
            type="number"
            min="1"
            placeholder="e.g. 100"
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(e.target.value)}
          />
        </div>

      </div>
    </Modal>
  );
}
