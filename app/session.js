// Reconnaissance is deliberately session-only. Resuming a Hardcore stage after
// leaving it starts another blind reconnaissance, never an unearned timed run.
export class StageSession {
  begin(stageId, difficulty = 'medium') {
    this.stageId = stageId;
    this.difficulty = difficulty;
    this.phase = difficulty === 'hardcore' ? 'recon' : 'timed';
    this.reconComplete = false;
  }
  get reconnaissance() { return this.phase === 'recon'; }
  completeRecon() {
    if (!this.reconnaissance) return false;
    this.reconComplete = true;
    return true;
  }
  repeatRecon() {
    if (!this.reconnaissance || !this.reconComplete) return false;
    this.reconComplete = false;
    return true;
  }
  startTimed() {
    if (!this.reconnaissance || !this.reconComplete) return false;
    this.phase = 'timed';
    return true;
  }
}
