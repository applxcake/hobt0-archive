import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        // OAuth provider returned an error; redirect to login with context.
        console.error("OAuth error:", error, errorDescription);
        navigate("/login");
        return;
      }

      if (!code) {
        navigate("/");
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error("exchangeCodeForSession error:", exchangeError);
        navigate("/login");
        return;
      }

      navigate("/");
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;

