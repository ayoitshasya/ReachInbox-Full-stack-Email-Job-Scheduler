import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import EmailTable from '../components/EmailTable';
import Button from '../components/Button';
import ComposeModal from '../features/compose/ComposeModal';
import { authApi, emailsApi } from '../utils/api';
import { clearToken } from '../utils/auth';
import { useNavigate } from 'react-router-dom';
import type { User, EmailJob, EmailSender } from '../types';

type Tab = 'scheduled' | 'sent';

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);

  const [scheduledJobs, setScheduledJobs] = useState<EmailJob[]>([]);
  const [sentJobs, setSentJobs] = useState<EmailJob[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);

  const [scheduledPage, setScheduledPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);

  const PAGE_SIZE = 20;

  useEffect(() => {
    authApi.getMe()
      .then(setUser)
      .catch(() => {
        clearToken();
        navigate('/login');
      });
    emailsApi.getSenders().then(setSenders).catch(() => {});
  }, [navigate]);

  const fetchScheduled = useCallback(async (page: number) => {
    setLoadingScheduled(true);
    try {
      const data = await emailsApi.getScheduled(page, PAGE_SIZE);
      setScheduledJobs(data.items);
      setScheduledTotal(data.total);
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const fetchSent = useCallback(async (page: number) => {
    setLoadingSent(true);
    try {
      const data = await emailsApi.getSent(page, PAGE_SIZE);
      setSentJobs(data.items);
      setSentTotal(data.total);
    } finally {
      setLoadingSent(false);
    }
  }, []);

  useEffect(() => { fetchScheduled(scheduledPage); }, [fetchScheduled, scheduledPage]);
  useEffect(() => { fetchSent(sentPage); }, [fetchSent, sentPage]);

  // poll scheduled tab every 15s to catch status changes
  useEffect(() => {
    const id = setInterval(() => {
      if (tab === 'scheduled') fetchScheduled(scheduledPage);
    }, 15000);
    return () => clearInterval(id);
  }, [tab, fetchScheduled, scheduledPage]);

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  function handleScheduled() {
    setTab('scheduled');
    fetchScheduled(1);
    setScheduledPage(1);
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  const scheduledTotalPages = Math.ceil(scheduledTotal / PAGE_SIZE);
  const sentTotalPages = Math.ceil(sentTotal / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={handleLogout} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Email Scheduler</h1>
            <p className="mt-1 text-sm text-gray-500">Schedule and track your email campaigns</p>
          </div>
          <Button onClick={() => setComposeOpen(true)} size="md">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Compose New Email
          </Button>
        </div>

        {/* tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {(['scheduled', 'sent'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'scheduled' ? 'Scheduled Emails' : 'Sent Emails'}
                {t === 'scheduled' && scheduledTotal > 0 && (
                  <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    {scheduledTotal}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {tab === 'scheduled' ? (
            <EmailTable jobs={scheduledJobs} loading={loadingScheduled} type="scheduled" />
          ) : (
            <EmailTable jobs={sentJobs} loading={loadingSent} type="sent" />
          )}
        </div>

        {/* pagination */}
        {tab === 'scheduled' && scheduledTotalPages > 1 && (
          <Pagination
            page={scheduledPage}
            totalPages={scheduledTotalPages}
            onChange={(p) => setScheduledPage(p)}
          />
        )}
        {tab === 'sent' && sentTotalPages > 1 && (
          <Pagination
            page={sentPage}
            totalPages={sentTotalPages}
            onChange={(p) => setSentPage(p)}
          />
        )}
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        senders={senders}
        onScheduled={handleScheduled}
      />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-gray-500">
        {page} / {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
