import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "./ProtectedRoute";
import { VerifiedRoute } from "./VerifiedRoute";
import { GuestRoute } from "./GuestRoute";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { DashboardPage } from "@/features/auth/pages/DashboardPage";
import { VerifyEmailPage } from "@/features/auth/pages/VerifyEmailPage";
import { VaultUploadPage } from "@/features/vault/pages/VaultUploadPage";
import { VaultDocumentsPage } from "@/features/vault/pages/VaultDocumentsPage";
import { VaultFoldersPage } from "@/features/vault/pages/VaultFoldersPage";
import { VaultChatPage } from "@/features/vault/pages/VaultChatPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
          { path: "/reset-password", element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/verify-email", element: <VerifyEmailPage /> },
      {
        element: <VerifiedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/vault/upload", element: <VaultUploadPage /> },
              { path: "/vault/documents", element: <VaultDocumentsPage /> },
              { path: "/vault/folders", element: <VaultFoldersPage /> },
              { path: "/vault/ask", element: <VaultChatPage /> },
              { path: "/vault", element: <VaultUploadPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
