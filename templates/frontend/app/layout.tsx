import './globals.css';
import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body><aside style={{padding:12, background:'#ecfdf5', color:'#166534',fontFamily:'system-ui'}}>Dữ liệu mock — demo frontend, chưa có backend thật.</aside>{children}</body></html>;
}
