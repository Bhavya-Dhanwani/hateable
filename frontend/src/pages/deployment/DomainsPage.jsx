import { Check, Copy, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { deploymentsApi } from '../../api/projects.js';
import { withIngressPort } from '../../utils/ingressUrl.js';
import { PageHeader, PageMessage } from './DeploymentLayout.jsx';

function CopyValue({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="group flex min-w-0 items-center gap-1.5 text-left font-mono text-white/80 hover:text-white"
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-300" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-30 group-hover:opacity-100" />
      )}
    </button>
  );
}

// One custom domain: its state, the DNS records to create, and verify / remove.
function DomainCard({ projectId, domain, onChange, onRemove }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  async function verify() {
    setBusy('verify');
    setNote('');
    try {
      const r = await deploymentsApi.verifyDomain(projectId, domain.domain);
      onChange(r.domain);
      if (!r.domain.verified) {
        setNote(
          'The TXT record was not found yet. DNS changes can take a few minutes, sometimes hours.'
        );
      } else if (!r.dns.routing) {
        setNote('Verified. Traffic will arrive once the second record below is in place.');
      }
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!window.confirm(`Disconnect ${domain.domain}?`)) return;
    setBusy('remove');
    try {
      await deploymentsApi.removeDomain(projectId, domain.domain);
      onRemove(domain.domain);
    } catch (e) {
      setNote(e.message);
      setBusy('');
    }
  }

  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={`size-1.5 rounded-full ${domain.verified ? 'bg-emerald-400' : 'bg-amber-400'}`}
        />
        <a
          href={withIngressPort(domain.url)}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate font-mono text-sm text-white hover:underline"
        >
          {domain.domain}
        </a>
        <span className="text-xs text-white/40">
          {domain.verified ? 'Connected' : 'Waiting for DNS'}
        </span>
        <div className="ml-auto flex gap-1">
          {!domain.verified && (
            <button
              type="button"
              onClick={verify}
              disabled={Boolean(busy)}
              className="flex h-7 items-center gap-1.5 rounded-md bg-white px-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              {busy === 'verify' ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Verify
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={Boolean(busy)}
            aria-label={`Remove ${domain.domain}`}
            className="grid size-7 place-items-center rounded-md text-white/35 hover:bg-white/5 hover:text-red-300"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {!domain.verified && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-white/45">
            Add these records at your domain provider, then press Verify:
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-white/30">
                <tr>
                  <th className="py-1 pr-4 font-normal">Type</th>
                  <th className="py-1 pr-4 font-normal">Name</th>
                  <th className="py-1 font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {domain.records.map((r) => (
                  <tr key={r.type} className="border-t border-line align-top">
                    <td className="py-1.5 pr-4 text-white/60">{r.type}</td>
                    <td className="max-w-48 py-1.5 pr-4">
                      <CopyValue value={r.name} />
                    </td>
                    <td className="max-w-64 py-1.5">
                      <CopyValue value={r.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-white/30">
            The TXT record proves the domain is yours; the {domain.records[1]?.type} record sends
            its visitors to this site.
          </p>
        </div>
      )}

      {note && <p className="border-t border-line px-4 py-2 text-xs text-white/55">{note}</p>}
    </li>
  );
}

// Custom domains: connect www.example.com (or example.com) to this deployment.
export function DomainsPage() {
  const { projectId } = useParams();
  const [domains, setDomains] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    deploymentsApi
      .domains(projectId)
      .then(setDomains)
      .catch((e) => {
        setDomains([]);
        setError(e.message);
      });
  }, [projectId]);

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const domain = await deploymentsApi.addDomain(projectId, input);
      setDomains((d) => [...d, domain]);
      setInput('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Domains"
        description="Serve this site on your own domain, alongside its hateable address."
      />

      <form onSubmit={add} className="mt-8 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="www.example.com"
          aria-label="Domain to connect"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 font-mono text-sm text-white outline-none placeholder:text-white/20 focus:border-white/20"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {!domains ? (
        <PageMessage>Loading domains...</PageMessage>
      ) : domains.length === 0 ? (
        <PageMessage>No custom domains yet.</PageMessage>
      ) : (
        <ul className="mt-6 space-y-3">
          {domains.map((d) => (
            <DomainCard
              key={d.domain}
              projectId={projectId}
              domain={d}
              onChange={(next) =>
                setDomains((all) => all.map((x) => (x.domain === next.domain ? next : x)))
              }
              onRemove={(name) => setDomains((all) => all.filter((x) => x.domain !== name))}
            />
          ))}
        </ul>
      )}

      <p className="mt-8 text-[11px] leading-5 text-white/30">
        Use a subdomain like www.example.com when you can: it only needs a CNAME. A bare domain
        (example.com) needs an A record to the hateable ingress instead.
      </p>
    </>
  );
}
