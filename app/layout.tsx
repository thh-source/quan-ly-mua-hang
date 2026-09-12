import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SupplierPickerEnhancer from "./SupplierPickerEnhancer";
import SupplierPickerLiveList from "./SupplierPickerLiveList";
import SupplierShortNameColumn from "./SupplierShortNameColumn";
import SupplierComparisonShortNames from "./SupplierComparisonShortNames";
import QuoteTableCustomizer from "./QuoteTableCustomizer";
import SupplierHistoryPopup from "./SupplierHistoryPopup";
import AiV2DocumentTest from "./AiV2DocumentTest";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hệ thống quản lý mua hàng",
  description: "Quản lý PR, báo giá, PO và hợp đồng",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#082f58",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SupplierPickerEnhancer />
        <SupplierPickerLiveList />
        <SupplierShortNameColumn />
        <SupplierComparisonShortNames />
        <QuoteTableCustomizer />
        <SupplierHistoryPopup />
        <AiV2DocumentTest />
      </body>
    </html>
  );
}
