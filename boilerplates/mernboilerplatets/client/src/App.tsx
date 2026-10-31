import { useState } from 'react';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { Input } from './components/ui/Input';

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-accent">Ready to build</span>
        <h1 className="text-4xl font-semibold sm:text-5xl">Start from a designed base</h1>
        <p className="max-w-prose text-muted">
          Tailwind, Inter and semantic theme tokens are wired up. Build with the tokens and the
          primitives in <code className="font-mono text-fg">src/components/ui/</code> — light and
          dark mode work out of the box.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <Input label="Project name" placeholder="my-app" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </Card>
    </main>
  );
}

export default App;
