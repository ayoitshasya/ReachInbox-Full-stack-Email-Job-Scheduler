import type { EmailJob, JobStatus } from '../types';

interface EmailTableProps {
  jobs: EmailJob[];
  loading: boolean;
  type: 'scheduled' | 'sent';
}

const statusColors: Record<JobStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  RESCHEDULED: 'bg-purple-100 text-purple-800',
};

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function EmailTable({ jobs, loading, type }: EmailTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        loading...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="mb-3 h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm">no {type} emails yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">recipient</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">subject</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              {type === 'scheduled' ? 'scheduled for' : 'sent at'}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">status</th>
            {type === 'sent' && (
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">preview</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">{job.recipient}</td>
              <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-700">{job.subject}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {type === 'scheduled'
                  ? formatDate(job.scheduledAt)
                  : formatDate(job.sentAt)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={job.status} />
              </td>
              {type === 'sent' && (
                <td className="px-4 py-3 text-sm">
                  {job.previewUrl ? (
                    <a
                      href={job.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      view
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
