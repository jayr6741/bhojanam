import { useEffect, useState } from 'react';
import AppLayout from './components/layout/AppLayout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import PosBillingPage from './pages/PosBillingPage.jsx';
import DataPage from './pages/DataPage.jsx';
import { apiRequest } from './services/api.js';

const pages = {
  Overview: DashboardPage,
  'POS Billing': PosBillingPage,
  Orders: () => <DataPage title="Orders" description="Track active orders and their current status." endpoint="/pos/orders" />,
  'Order History': () => <DataPage title="Order History" description="Review completed and cancelled orders." endpoint="/pos/orders?history=true" />,
  Tables: () => <DataPage title="Tables" description="View table availability and occupancy." endpoint="/pos/tables" />,
  Menu: () => <DataPage title="Menu Management" description="Manage menu items and availability." endpoint="/pos/menu" />,
  Customers: () => <DataPage title="Customers" description="Customer records and visit history." endpoint="/pos/customers" />,
  Loyalty: () => <DataPage title="Loyalty" description="Customer points and rewards." endpoint="/pos/loyalty" />,
  Revenue: () => <DataPage title="Revenue & Reports" description="Revenue summaries and payment reports." endpoint="/pos/revenue" />,
  'User Management': () => <DataPage title="User Management" description="Staff accounts, roles and permissions." endpoint="/account/users" />,
  'QR Menu': () => <DataPage title="QR Menu" description="QR ordering and table-linked customer orders." endpoint="/qr-menu" />,
  Settings: () => <DataPage title="Settings" description="Restaurant and POS configuration." endpoint="/pos/settings" />,
};

export default function App() {
  const [activePage, setActivePage] = useState('Overview');
  const [apiStatus, setApiStatus] = useState('checking');
  useEffect(() => {
    apiRequest('/health').then(() => setApiStatus('connected')).catch(() => setApiStatus('offline'));
  }, []);
  const Page = pages[activePage] || DashboardPage;
  return <AppLayout activePage={activePage} onNavigate={setActivePage} apiStatus={apiStatus}>
    <Page onNavigate={setActivePage} />
  </AppLayout>;
}
