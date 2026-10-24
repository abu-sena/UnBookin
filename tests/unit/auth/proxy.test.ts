import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('proxy', () => {
  it('redirects signed-out visitors to /masuk with the original path', () => {
    const response = proxy(request('/library?filter=ready'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/masuk?callbackUrl=%2Flibrary%3Ffilter%3Dready',
    );
  });

  it.each(['authjs.session-token', '__Secure-authjs.session-token'])(
    'lets requests with %s through for the layout to validate',
    (name) => {
      const response = proxy(request('/home', `${name}=abc`));
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );
});
