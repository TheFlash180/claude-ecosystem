import { describe, expect, it } from 'vitest';
import {
  filterRoutines, minutesLabel, muscleOptions, prescription, musclesOf,
  searchExercises, stepsOf, thumbnails, EMPTY_EXERCISE_FILTER,
} from '../library';
import type { Exercise, Routine, RoutineExercise } from '../config';

function ex(p: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    muscle: 'chest', equipment: 'dumbbell', setting: 'home',
    imageUrl: `https://example.test/${p.id}.jpg`, instructions: 'Do the thing.', ...p,
  };
}

const PRESS = ex({ id: 'press', name: 'Dumbbell Floor Press', muscle: 'triceps' });
const PUSHUP = ex({ id: 'pushup', name: 'Push-Ups', muscle: 'chest', equipment: 'body only' });
const RAISE = ex({ id: 'raise', name: 'Side Lateral Raise', muscle: 'shoulders' });
const CAT = ex({ id: 'cat', name: 'Cat Stretch', muscle: 'lower back', equipment: 'body only', imageUrl: '' });

const CATALOGUE = new Map([PRESS, PUSHUP, RAISE, CAT].map(e => [e.id, e]));

function plan(exerciseId: string, sets: number, reps: string, note = ''): RoutineExercise {
  return { exerciseId, sets, reps, note };
}

function routine(p: Partial<Routine> & { id: string }): Routine {
  return {
    title: 'Push Day', kind: 'home', subtitle: '', summary: '', estMinutes: 35,
    exercises: [], ...p,
  };
}

const PUSH = routine({
  id: 'push',
  exercises: [plan('press', 3, '10'), plan('pushup', 3, '12'), plan('raise', 3, '15')],
});
const MOBILITY = routine({
  id: 'mobility', kind: 'mobility', estMinutes: 12,
  exercises: [plan('cat', 1, '30 sec')],
});
const GYM = routine({ id: 'gym', kind: 'gym', exercises: [plan('press', 4, '10')] });

describe('stepsOf', () => {
  it('resolves in routine order', () => {
    expect(stepsOf(PUSH, CATALOGUE).map(s => s.exercise.id)).toEqual(['press', 'pushup', 'raise']);
  });

  it('drops an exercise that is no longer in the catalogue', () => {
    // The two tables can drift; a blank row in the middle of a workout is
    // worse than a shorter workout.
    const stale = routine({ id: 'x', exercises: [plan('press', 3, '10'), plan('deleted', 3, '10')] });
    expect(stepsOf(stale, CATALOGUE)).toHaveLength(1);
  });
});

describe('prescription', () => {
  it('reads sets × reps for a lift', () => {
    expect(prescription(plan('press', 3, '10'))).toBe('3 × 10');
  });

  it('drops the "1 ×" for a single-set hold', () => {
    // "1 × 30 sec" is noise on a stretch.
    expect(prescription(plan('cat', 1, '30 sec'))).toBe('30 sec');
  });

  it('falls back to a set count when there are no reps', () => {
    expect(prescription(plan('press', 3, ''))).toBe('3 sets');
  });
});

describe('musclesOf', () => {
  it('lists each muscle once, in the order it comes up', () => {
    expect(musclesOf(PUSH, CATALOGUE)).toEqual(['triceps', 'chest', 'shoulders']);
  });
});

describe('thumbnails', () => {
  it('takes the first n photos', () => {
    expect(thumbnails(PUSH, CATALOGUE, 2)).toHaveLength(2);
  });

  it('skips an exercise with no photo rather than leaving a gap', () => {
    expect(thumbnails(MOBILITY, CATALOGUE)).toEqual([]);
  });
});

describe('filterRoutines', () => {
  const all = [PUSH, MOBILITY, GYM];
  it('returns everything for "all"', () => {
    expect(filterRoutines(all, 'all')).toHaveLength(3);
  });
  it('narrows to one kind', () => {
    expect(filterRoutines(all, 'gym').map(r => r.id)).toEqual(['gym']);
  });
});

describe('searchExercises', () => {
  const all = [PRESS, PUSHUP, RAISE, CAT];

  it('returns everything by default', () => {
    expect(searchExercises(all, EMPTY_EXERCISE_FILTER)).toHaveLength(4);
  });

  it('matches on equipment, not just the name', () => {
    // "what can I do with just my bodyweight" is the common question.
    const hits = searchExercises(all, { ...EMPTY_EXERCISE_FILTER, search: 'body only' });
    expect(hits.map(e => e.id)).toEqual(['pushup', 'cat']);
  });

  it('matches on muscle and ignores case', () => {
    expect(searchExercises(all, { ...EMPTY_EXERCISE_FILTER, search: 'SHOULDERS' }).map(e => e.id))
      .toEqual(['raise']);
  });

  it('combines the muscle chip with the search box', () => {
    const hits = searchExercises(all, { search: 'press', muscle: 'triceps' });
    expect(hits.map(e => e.id)).toEqual(['press']);
    expect(searchExercises(all, { search: 'press', muscle: 'chest' })).toEqual([]);
  });
});

describe('muscleOptions', () => {
  it('is de-duplicated and alphabetical', () => {
    expect(muscleOptions([PRESS, PUSHUP, RAISE, CAT, PRESS]))
      .toEqual(['chest', 'lower back', 'shoulders', 'triceps']);
  });
});

describe('minutesLabel', () => {
  it('reads minutes under an hour', () => {
    expect(minutesLabel(35)).toBe('35 min');
  });
  it('reads hours above one', () => {
    expect(minutesLabel(75)).toBe('1 hr 15 min');
    expect(minutesLabel(120)).toBe('2 hr');
  });
  it('says nothing when the time is unknown', () => {
    expect(minutesLabel(null)).toBe('');
    expect(minutesLabel(0)).toBe('');
  });
});
