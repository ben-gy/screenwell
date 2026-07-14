import { describe, expect, it } from 'vitest';
import { INITIAL_MODEL, isActive, reduce, type RecModel } from '../src/recorder';

const at = (state: RecModel['state']): RecModel => ({ state });

describe('recorder reducer', () => {
  it('starts idle', () => {
    expect(INITIAL_MODEL).toEqual({ state: 'idle' });
  });

  it('walks the happy path idle → arming → recording → finalizing → ready', () => {
    let m = INITIAL_MODEL;
    m = reduce(m, { type: 'arm' });
    expect(m.state).toBe('arming');
    m = reduce(m, { type: 'armed' });
    expect(m.state).toBe('recording');
    m = reduce(m, { type: 'stop' });
    expect(m.state).toBe('finalizing');
    m = reduce(m, { type: 'finalized' });
    expect(m.state).toBe('ready');
  });

  it('supports pause and resume only while recording/paused', () => {
    expect(reduce(at('recording'), { type: 'pause' }).state).toBe('paused');
    expect(reduce(at('paused'), { type: 'resume' }).state).toBe('recording');
    // Invalid: pausing when idle is a no-op
    expect(reduce(at('idle'), { type: 'pause' }).state).toBe('idle');
    expect(reduce(at('ready'), { type: 'resume' }).state).toBe('ready');
  });

  it('can stop from paused', () => {
    expect(reduce(at('paused'), { type: 'stop' }).state).toBe('finalizing');
  });

  it('ignores armed unless arming', () => {
    expect(reduce(at('idle'), { type: 'armed' }).state).toBe('idle');
    expect(reduce(at('recording'), { type: 'armed' }).state).toBe('recording');
  });

  it('ignores finalized unless finalizing', () => {
    expect(reduce(at('recording'), { type: 'finalized' }).state).toBe('recording');
  });

  it('fail transitions from any state and carries a message', () => {
    const m = reduce(at('recording'), { type: 'fail', error: 'device lost' });
    expect(m.state).toBe('error');
    expect(m.error).toBe('device lost');
    expect(reduce(at('arming'), { type: 'fail', error: 'x' }).state).toBe('error');
  });

  it('reset returns to idle from any state', () => {
    expect(reduce(at('ready'), { type: 'reset' }).state).toBe('idle');
    expect(reduce(at('error'), { type: 'reset' }).state).toBe('idle');
    expect(reduce(at('arming'), { type: 'reset' }).state).toBe('idle');
  });

  it('does not allow arm from a non-idle state', () => {
    expect(reduce(at('recording'), { type: 'arm' }).state).toBe('recording');
  });
});

describe('isActive', () => {
  it('is true only while recording or paused', () => {
    expect(isActive('recording')).toBe(true);
    expect(isActive('paused')).toBe(true);
    expect(isActive('idle')).toBe(false);
    expect(isActive('arming')).toBe(false);
    expect(isActive('finalizing')).toBe(false);
    expect(isActive('ready')).toBe(false);
    expect(isActive('error')).toBe(false);
  });
});
