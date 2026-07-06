import { useAuth } from '../lib/auth-context';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';


export function Login() {
  const { user, login, demoLogin } = useAuth();

  if (user) {
    return <Navigate to="/app" />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/procurely-logo.svg" alt="Procurely" className="h-10" />
          </div>
          <CardTitle className="text-xl">Welcome to Procurely</CardTitle>
          <CardDescription>AI-Powered Procurement Platform</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={login} size="lg" className="w-full">
            Sign in with Google
          </Button>

          <div className="relative my-2">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <Button onClick={demoLogin} variant="outline" size="lg" className="w-full">
            Demo Login (Hackathon Judges)
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-4">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
