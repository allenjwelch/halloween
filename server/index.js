import express from 'express'
import initSqlJs from 'sql.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const databaseDir = join(rootDir, 'data')
const databasePath = join(databaseDir, 'halloween.sqlite')
const port = Number(process.env.PORT) || 3001

const SQL = await initSqlJs({
  locateFile: (file) => join(rootDir, 'node_modules', 'sql.js', 'dist', file),
})

mkdirSync(databaseDir, { recursive: true })
const database = new SQL.Database(
  existsSync(databasePath) ? new Uint8Array(readFileSync(databasePath)) : undefined,
)

database.run(`
  CREATE TABLE IF NOT EXISTS contestants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contestant_id INTEGER NOT NULL REFERENCES contestants(id),
    voter_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS event_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_complete INTEGER NOT NULL DEFAULT 0,
    allow_multiple_votes INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO event_state (id, is_complete) VALUES (1, 0);
`)

const voteColumns = database.exec('PRAGMA table_info(votes)')[0]?.values.map((column) => column[1]) ?? []
if (!voteColumns.includes('voter_id')) {
  database.run('ALTER TABLE votes ADD COLUMN voter_id TEXT')
}
const eventStateColumns = database.exec('PRAGMA table_info(event_state)')[0]?.values.map((column) => column[1]) ?? []
if (!eventStateColumns.includes('allow_multiple_votes')) {
  database.run('ALTER TABLE event_state ADD COLUMN allow_multiple_votes INTEGER NOT NULL DEFAULT 0')
}
database.run('DROP INDEX IF EXISTS idx_votes_voter_id')

function saveDatabase() {
  writeFileSync(databasePath, Buffer.from(database.export()))
}

function rows(sql, params = []) {
  const result = database.exec(sql, params)[0]
  if (!result) return []
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  )
}

function getEvent() {
  const [{ is_complete: isComplete, allow_multiple_votes: allowMultipleVotes }] = rows('SELECT is_complete, allow_multiple_votes FROM event_state WHERE id = 1')
  const contestants = rows(`
    SELECT contestants.id, contestants.name, COUNT(votes.id) AS votes
    FROM contestants
    LEFT JOIN votes ON votes.contestant_id = contestants.id
    GROUP BY contestants.id
    ORDER BY contestants.name COLLATE NOCASE ASC
  `).map((contestant) => ({ ...contestant, votes: Number(contestant.votes) }))

  const complete = Boolean(isComplete)
  const highestVoteCount = Math.max(0, ...contestants.map((contestant) => contestant.votes))
  const winners = complete && highestVoteCount > 0
    ? contestants.filter((contestant) => contestant.votes === highestVoteCount)
    : []

  return {
    complete,
    allowMultipleVotes: Boolean(allowMultipleVotes),
    contestants: contestants.map(({ votes, ...contestant }) => ({
      ...contestant,
      ...(complete ? { votes } : {}),
    })),
    ...(complete ? { totalVotes: contestants.reduce((total, contestant) => total + contestant.votes, 0), winners } : {}),
  }
}

const app = express()
app.use(express.json())

app.get('/api/event', (_request, response) => {
  const voterId = typeof _request.query.voterId === 'string' ? _request.query.voterId : ''
  const event = getEvent()
  response.json({
    ...event,
    ...(voterId ? { voted: !event.allowMultipleVotes && rows('SELECT id FROM votes WHERE voter_id = ?', [voterId]).length > 0 } : {}),
  })
})

app.post('/api/voting-settings', (request, response) => {
  if (typeof request.body?.allowMultipleVotes !== 'boolean') {
    return response.status(400).json({ error: 'Choose whether repeat votes are allowed.' })
  }
  database.run('UPDATE event_state SET allow_multiple_votes = ? WHERE id = 1', [request.body.allowMultipleVotes ? 1 : 0])
  saveDatabase()
  return response.json(getEvent())
})

app.post('/api/contestants', (request, response) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
  if (!name || name.length > 60) {
    return response.status(400).json({ error: 'Enter a name between 1 and 60 characters.' })
  }
  if (rows('SELECT is_complete FROM event_state WHERE id = 1')[0].is_complete) {
    return response.status(409).json({ error: 'The event is complete. The lineup is closed.' })
  }
  if (rows('SELECT id FROM contestants WHERE name = ?', [name]).length > 0) {
    return response.status(409).json({ error: 'That name is already on the list.' })
  }

  database.run('INSERT INTO contestants (name) VALUES (?)', [name])
  saveDatabase()
  return response.status(201).json(getEvent())
})

app.delete('/api/contestants/:id', (request, response) => {
  const contestantId = Number(request.params.id)
  if (!Number.isInteger(contestantId) || contestantId < 1) {
    return response.status(400).json({ error: 'Invalid contestant.' })
  }
  if (rows('SELECT is_complete FROM event_state WHERE id = 1')[0].is_complete) {
    return response.status(409).json({ error: 'The event is complete. The lineup is closed.' })
  }
  if (rows('SELECT id FROM contestants WHERE id = ?', [contestantId]).length === 0) {
    return response.status(404).json({ error: 'That contestant could not be found.' })
  }

  database.run('DELETE FROM votes WHERE contestant_id = ?', [contestantId])
  database.run('DELETE FROM contestants WHERE id = ?', [contestantId])
  saveDatabase()
  return response.json(getEvent())
})

app.post('/api/votes', (request, response) => {
  const contestantId = Number(request.body?.contestantId)
  const voterId = typeof request.body?.voterId === 'string' ? request.body.voterId.trim() : ''
  if (!Number.isInteger(contestantId) || contestantId < 1) {
    return response.status(400).json({ error: 'Choose a costume before casting your vote.' })
  }
  if (!voterId || voterId.length > 100) {
    return response.status(400).json({ error: 'Refresh the page and try voting again.' })
  }
  if (rows('SELECT is_complete FROM event_state WHERE id = 1')[0].is_complete) {
    return response.status(409).json({ error: 'Voting is closed.' })
  }
  const [{ allow_multiple_votes: allowMultipleVotes }] = rows('SELECT allow_multiple_votes FROM event_state WHERE id = 1')
  if (!allowMultipleVotes && rows('SELECT id FROM votes WHERE voter_id = ?', [voterId]).length > 0) {
    return response.status(409).json({ error: 'This browser has already voted.' })
  }
  if (rows('SELECT id FROM contestants WHERE id = ?', [contestantId]).length === 0) {
    return response.status(404).json({ error: 'That contestant could not be found.' })
  }

  database.run('INSERT INTO votes (contestant_id, voter_id) VALUES (?, ?)', [contestantId, voterId])
  saveDatabase()
  return response.status(201).json({
    ok: true,
    ...getEvent(),
    voted: !allowMultipleVotes,
  })
})

app.post('/api/complete', (_request, response) => {
  database.run('UPDATE event_state SET is_complete = 1 WHERE id = 1')
  saveDatabase()
  return response.json(getEvent())
})

app.post('/api/reopen', (_request, response) => {
  database.run('UPDATE event_state SET is_complete = 0 WHERE id = 1')
  saveDatabase()
  return response.json(getEvent())
})

app.post('/api/reset', (_request, response) => {
  database.run('DELETE FROM votes')
  database.run('DELETE FROM contestants')
  database.run('UPDATE sqlite_sequence SET seq = 0 WHERE name IN (\'votes\', \'contestants\')')
  database.run('UPDATE event_state SET is_complete = 0, allow_multiple_votes = 0 WHERE id = 1')
  saveDatabase()
  return response.json(getEvent())
})

app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
app.use(express.static(join(rootDir, 'dist')))
app.use((_request, response) => response.sendFile(join(rootDir, 'dist', 'index.html')))

app.listen(port, () => {
  console.log(`Halloween voting API ready at http://localhost:${port}`)
})
