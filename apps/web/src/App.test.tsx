// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => cleanup());

describe('App', () => {
  it('renders the application heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Köseoğlu Lojistik Growth/i })).toBeTruthy();
  });

  it('shows all planned social channels and the safe-mode boundary', () => {
    render(<App />);
    expect(screen.getByText(/Güvenli mod:/i)).toBeTruthy();
    for (const platform of ['LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'X', 'THREADS', 'TIKTOK', 'YOUTUBE', 'GOOGLE BUSINESS', 'PINTEREST']) {
      expect(screen.getByText(platform)).toBeTruthy();
    }
  });
});
