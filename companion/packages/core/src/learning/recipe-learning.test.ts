import { describe, expect, it } from 'vitest';
import { InMemoryRecipeStore, RecipeSuggester } from './recipe-learning.js';

describe('RecipeStore', () => {
  it('saves and retrieves recipes', () => {
    const store = new InMemoryRecipeStore();
    const recipe = store.saveRecipe({
      name: 'Open Notepad',
      description: 'Opens notepad application',
      toolSequence: ['os.open'],
      approved: false,
      contextHints: ['opening apps', 'notepad'],
    });

    const retrieved = store.getRecipe(recipe.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.name).toBe('Open Notepad');
  });

  it('approves recipes', () => {
    const store = new InMemoryRecipeStore();
    const recipe = store.saveRecipe({
      name: 'Test',
      description: 'Test recipe',
      toolSequence: ['os.open'],
      approved: false,
      contextHints: ['test'],
    });

    store.approveRecipe(recipe.id);
    const retrieved = store.getRecipe(recipe.id);
    expect(retrieved?.approved).toBe(true);
  });

  it('rejects recipes', () => {
    const store = new InMemoryRecipeStore();
    const recipe = store.saveRecipe({
      name: 'Test',
      description: 'Test recipe',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });

    store.rejectRecipe(recipe.id);
    const retrieved = store.getRecipe(recipe.id);
    expect(retrieved?.approved).toBe(false);
  });

  it('lists recipes with approval filter', () => {
    const store = new InMemoryRecipeStore();
    store.saveRecipe({
      name: 'Approved',
      description: 'Approved recipe',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });
    store.saveRecipe({
      name: 'Pending',
      description: 'Pending recipe',
      toolSequence: ['os.speak'],
      approved: false,
      contextHints: ['test'],
    });

    const all = store.listRecipes();
    expect(all).toHaveLength(2);

    const approved = store.listRecipes(true);
    expect(approved).toHaveLength(1);
    expect(approved[0]?.name).toBe('Approved');
  });

  it('finds recipes by context', () => {
    const store = new InMemoryRecipeStore();
    store.saveRecipe({
      name: 'Email Recipe',
      description: 'Email workflow',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['email', 'messaging'],
    });
    store.saveRecipe({
      name: 'Notepad Recipe',
      description: 'Notepad workflow',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['opening apps', 'notepad'],
    });

    const results = store.findRecipesByContext('send email');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Email Recipe');
  });

  it('records usage and updates success rate', () => {
    const store = new InMemoryRecipeStore();
    const recipe = store.saveRecipe({
      name: 'Test',
      description: 'Test recipe',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });

    store.recordUsage(recipe.id, true);
    let retrieved = store.getRecipe(recipe.id);
    expect(retrieved?.successRate).toBeGreaterThan(0);

    store.recordUsage(recipe.id, false);
    retrieved = store.getRecipe(recipe.id);
    expect(retrieved?.successRate).toBeLessThan(1);
  });

  it('deletes recipes', () => {
    const store = new InMemoryRecipeStore();
    const recipe = store.saveRecipe({
      name: 'Test',
      description: 'Test recipe',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });

    store.deleteRecipe(recipe.id);
    const retrieved = store.getRecipe(recipe.id);
    expect(retrieved).toBeNull();
  });

  it('clears all recipes', () => {
    const store = new InMemoryRecipeStore();
    store.saveRecipe({
      name: 'Test',
      description: 'Test recipe',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });

    store.clear();
    expect(store.listRecipes()).toHaveLength(0);
  });
});

describe('RecipeSuggester', () => {
  it('suggests recipes by context', () => {
    const store = new InMemoryRecipeStore();
    store.saveRecipe({
      name: 'Email Recipe',
      description: 'Email workflow',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['email'],
    });

    const suggester = new RecipeSuggester(store);
    const suggestions = suggester.suggest('send email');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('Email Recipe');
  });

  it('sorts by success rate and recency', () => {
    const store = new InMemoryRecipeStore();
    const recipe1 = store.saveRecipe({
      name: 'High Success',
      description: 'High success rate',
      toolSequence: ['os.open'],
      approved: true,
      contextHints: ['test'],
    });
    const recipe2 = store.saveRecipe({
      name: 'Low Success',
      description: 'Low success rate',
      toolSequence: ['os.speak'],
      approved: true,
      contextHints: ['test'],
    });

    store.recordUsage(recipe1.id, true);
    store.recordUsage(recipe1.id, true);
    store.recordUsage(recipe2.id, false);

    const suggester = new RecipeSuggester(store);
    const suggestions = suggester.suggest('test context');
    expect(suggestions[0]?.name).toBe('High Success');
  });

  it('limits suggestions count', () => {
    const store = new InMemoryRecipeStore();
    for (let i = 0; i < 5; i++) {
      store.saveRecipe({
        name: `Recipe ${i}`,
        description: `Recipe ${i}`,
        toolSequence: ['os.open'],
        approved: true,
        contextHints: ['test'],
      });
    }

    const suggester = new RecipeSuggester(store);
    const suggestions = suggester.suggest('test context', 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('extracts context hints from message', () => {
    const suggester = new RecipeSuggester(new InMemoryRecipeStore());
    const hints = suggester.extractContextHints('Open notepad and send email');
    expect(hints).toContain('opening apps');
    expect(hints).toContain('email');
  });

  it('returns empty array for no matches', () => {
    const store = new InMemoryRecipeStore();
    const suggester = new RecipeSuggester(store);
    const suggestions = suggester.suggest('unknown context');
    expect(suggestions).toHaveLength(0);
  });
});
