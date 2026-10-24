import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Contestant = { id: number; name: string; votes?: number }
type EventData = {
  complete: boolean
  contestants: Contestant[]
  totalVotes?: number
  winners?: Contestant[]
  voted?: boolean
}

function getVoterId() {
  try {
    let voterId = localStorage.getItem('moonlight-voter-id')
    if (!voterId) {
      voterId = globalThis.crypto?.randomUUID?.() ?? `voter-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('moonlight-voter-id', voterId)
    }
    return voterId
  } catch {
    return `temporary-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
  return data as T
}

function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  const [voterId] = useState(getVoterId)
  const [event, setEvent] = useState<EventData | null>(null)
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    request<EventData>(`/api/event?voterId=${encodeURIComponent(voterId)}`)
      .then((data) => {
        setEvent(data)
        setHasVoted(Boolean(data.voted))
      })
      .catch((cause: Error) => setError(cause.message))
  }, [voterId])

  async function addContestant(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault()
    setMessage('')
    setError('')
    setBusy(true)
    try {
      setEvent(await request<EventData>('/api/contestants', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }))
      setName('')
      setMessage('Added to the costume lineup.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that name.')
    } finally {
      setBusy(false)
    }
  }

  async function castVote(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault()
    setMessage('')
    setError('')
    setBusy(true)
    try {
      await request('/api/votes', {
        method: 'POST',
        body: JSON.stringify({ contestantId: Number(selectedId), voterId }),
      })
      setSelectedId('')
      setHasVoted(true)
      setMessage('Your vote has been tucked safely into the ballot box.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cast your vote.')
    } finally {
      setBusy(false)
    }
  }

  async function removeContestant(contestant: Contestant) {
    if (!window.confirm(`Remove ${contestant.name} from the lineup? Any votes for them will also be deleted.`)) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      setEvent(await request<EventData>(`/api/contestants/${contestant.id}`, { method: 'DELETE' }))
      setMessage(`${contestant.name} was removed from the lineup.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove that contestant.')
    } finally {
      setBusy(false)
    }
  }

  async function completeVoting() {
    if (!window.confirm('Close the ballot and reveal the winner? You can reopen voting later from the admin page.')) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      setEvent(await request<EventData>('/api/complete', { method: 'POST' }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete voting.')
    } finally {
      setBusy(false)
    }
  }

  async function reopenVoting() {
    if (!window.confirm('Reopen the ballot? Previous votes will be kept, and voters will be able to submit more votes.')) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      setEvent(await request<EventData>('/api/reopen', { method: 'POST' }))
      setMessage('The ballot is open again. Previous votes have been kept.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reopen voting.')
    } finally {
      setBusy(false)
    }
  }

  async function resetEvent() {
    if (!window.confirm('Start fresh? This permanently deletes every contestant and vote, and reopens the ballot.')) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      setEvent(await request<EventData>('/api/reset', { method: 'POST' }))
      setName('')
      setSelectedId('')
      setMessage('The ballot is cleared and ready for a fresh event.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset the event.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href={isAdmin ? '/admin' : '/'} aria-label="Moonlight home"><span>☾</span> MOONLIGHT</a>
        <span className="event-tag"><i /> HALLOWEEN COSTUME BALL</span>
        <a className="page-switch" href={isAdmin ? '/' : '/admin'}>{isAdmin ? 'VOTING BOOTH ↗' : 'ADMIN ↗'}</a>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>✳</span> {isAdmin ? 'BALLOT CONTROL ROOM' : 'THE ANNUAL COSTUME SHOWDOWN'} <span>✳</span></div>
        <h1>{isAdmin ? <>Set the <em>stage.</em></> : <>A little <em>magic.</em><br />A lot of costume.</>}</h1>
        <p className="hero-copy">{isAdmin ? 'Manage the lineup and close the ballot when it’s time.' : 'Pick your favorite look. Let the moon decide.'}</p>
        <div className="moon-art" aria-hidden="true"><span>✦</span><div className="moon">☾</div><span>✧</span></div>
        <div className="hero-rule"><span>✳</span></div>
      </section>

      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}

      {!event ? (
        <section className="panel loading-panel">Opening the ballot box…</section>
      ) : isAdmin ? (
        <section className="admin-layout">
          <article className="panel admin-panel">
            <div className="panel-heading"><span className="step-number">01</span><span className="section-kicker">CONTESTANT LINEUP</span></div>
            <div className="admin-title-row"><div><h2>Costume<br />company</h2><p className="panel-copy">Add everyone who’s joining the showdown. Names appear in the public voting dropdown.</p></div><span className="count-pill">{event.contestants.length.toString().padStart(2, '0')}</span></div>
            {event.contestants.length ? (
              <ol className="contestant-list admin-contestants">
                {event.contestants.map((contestant, index) => <li key={contestant.id}><span className="list-index">{String(index + 1).padStart(2, '0')}</span><span>{contestant.name}</span><button className="remove-contestant" type="button" onClick={() => removeContestant(contestant)} disabled={busy} aria-label={`Remove ${contestant.name}`} title="Remove contestant">×</button></li>)}
              </ol>
            ) : <p className="empty-list admin-empty">No contestants yet. Add the first name below.</p>}
            {!event.complete && <form className="add-form" onSubmit={addContestant}>
              <label htmlFor="contestant-name">ADD A CONTESTANT</label>
              <div className="input-row"><input id="contestant-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Their name…" disabled={busy} required /><button className="add-button" type="submit" disabled={busy || !name.trim()} aria-label="Add contestant">+</button></div>
            </form>}
          </article>
          <article className="panel admin-close-panel">
            <div className="panel-heading"><span className="step-number">02</span><span className="section-kicker">BALLOT STATUS</span></div>
            <h2>{event.complete ? 'The ballot is closed.' : 'Ready to call it?'}</h2>
            <p className="panel-copy">{event.complete ? 'Voting has ended. The results are ready to reveal on the voting page.' : 'When everyone has cast a vote, close the ballot to reveal the winner and full tally.'}</p>
            {event.complete ? (
              <>
                <div className="admin-winner-summary">
                  <span className="section-kicker">{event.totalVotes === 0 ? 'NO VOTES CAST' : 'COSTUME WINNER'}</span>
                  {event.totalVotes === 0 ? <strong>No winner this time</strong> : (
                    <div className="admin-winner-list">
                      {event.winners?.map((winner) => <div className="admin-winner" key={winner.id}><span>♛</span><strong>{winner.name}</strong><small>{winner.votes} {winner.votes === 1 ? 'vote' : 'votes'}</small></div>)}
                    </div>
                  )}
                  <p>{event.totalVotes ?? 0} {(event.totalVotes ?? 0) === 1 ? 'ballot' : 'ballots'} counted</p>
                </div>
                <div className="admin-closed-actions">
                  <a className="button quiet admin-result-link" href="/">View full tally <span>↗</span></a>
                  <button className="button primary" type="button" onClick={reopenVoting} disabled={busy}>Reopen voting <span>↻</span></button>
                </div>
              </>
            ) : (
              <button className="button primary" type="button" onClick={completeVoting} disabled={busy || event.contestants.length === 0}>End voting <span>→</span></button>
            )}
            {!event.complete && event.contestants.length === 0 && <p className="admin-hint">Add at least one contestant before closing the ballot.</p>}
          </article>
          <article className="reset-card">
            <div><span className="section-kicker">START OVER</span><p>Clear every contestant and vote, then reopen the ballot for a new event.</p></div>
            <button className="button danger" type="button" onClick={resetEvent} disabled={busy || event.contestants.length === 0}>Clear all data</button>
          </article>
        </section>
      ) : event.complete ? (
        <section className="panel results-panel">
          <div className="section-kicker">THE SPELL IS CAST</div>
          <h2>{event.totalVotes === 0 ? 'The night is yours.' : event.winners?.length === 1 ? 'And the crown goes to…' : 'A tie in the moonlight!'}</h2>
          {event.totalVotes === 0 ? (
            <p className="empty-results">No votes were cast this time around.</p>
          ) : (
            <div className="winner-list">
              {event.winners?.map((winner) => (
                <div className="winner-card" key={winner.id}>
                  <span className="winner-crown">♛</span>
                  <strong>{winner.name}</strong>
                  <span className="winner-votes">{winner.votes} {winner.votes === 1 ? 'vote' : 'votes'}</span>
                </div>
              ))}
            </div>
          )}
          <p className="total-votes">{event.totalVotes} {event.totalVotes === 1 ? 'ballot' : 'ballots'} counted</p>
          <div className="results-list">
            <h3>Full tally</h3>
            {event.contestants.map((contestant) => (
              <div className="tally-row" key={contestant.id}>
                <span>{contestant.name}</span><strong>{contestant.votes}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="voter-layout">
          <article className="panel ballot-panel">
            <div className="panel-heading"><span className="step-number">01</span><span className="section-kicker">CAST YOUR VOTE</span></div>
            <h2>Who wore it<br />best?</h2>
            <p className="panel-copy">{hasVoted ? 'Your ballot is in. Each browser can submit one vote.' : 'Choose your favorite costume from the lineup. One little click makes it official.'}</p>
            {!hasVoted && <form onSubmit={castVote}>
              <label htmlFor="contestant-select">YOUR PICK</label>
              <select id="contestant-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy || event.contestants.length === 0} required>
                <option value="" disabled>{event.contestants.length ? 'Choose a costume…' : 'Add contestants first'}</option>
                {event.contestants.map((contestant) => <option value={contestant.id} key={contestant.id}>{contestant.name}</option>)}
              </select>
              <button className="button primary" type="submit" disabled={busy || !selectedId}>Drop your vote <span>↗</span></button>
            </form>}
            <div className="privacy-note"><span>✳</span> {hasVoted ? 'One vote per browser until the ballot is reset.' : 'The tally stays secret until the ballot closes.'}</div>
          </article>
        </section>
      )}

      <footer className="footer"><span>MADE FOR A NIGHT OF MYSTERY</span><span>✳</span><span>KEEP IT SPOOKY</span></footer>
    </main>
  )
}

export default App
