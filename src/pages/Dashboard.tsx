import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, FileText, CheckCircle, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data-context';
import { ProcureToPayJourney } from '../components/ProcureToPayJourney';

const procurementVelocityData = Array.from({ length: 30 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const baseSubmitted = isWeekend ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 8) + 4;
  const baseApproved = Math.max(0, baseSubmitted - Math.floor(Math.random() * 3));
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    submitted: baseSubmitted,
    approved: baseApproved,
  };
});

export function Dashboard() {
  const navigate = useNavigate();
  const { intakes, suppliers, spendMetrics, departmentSpendMetrics } = useData();

  const activeRequestsCount = intakes.filter(req => req.status !== 'Draft' && req.status !== 'PO Generated' && req.status !== 'Rejected').length;
  const pendingApprovalsCount = intakes.filter(req => req.status === 'Pending Manager Approval' || req.status === 'Pending Finance Approval').length;
  const activeSuppliersCount = suppliers.filter(s => s.status === 'Active').length;

  const recentApprovals = intakes
    .filter(req => req.status === 'PO Generated' || req.status === 'Pending Manager Approval' || req.status === 'Pending Finance Approval' || req.status === 'Pending RFQ')
    .slice(0, 5)
    .map(req => ({
      id: req.id,
      name: req.title,
      amount: req.amount,
      status: req.status === 'PO Generated' ? 'Approved' : 'Pending'
    }));

  const hasSpendData = spendMetrics && spendMetrics.length > 0;
  const hasDepartmentData = departmentSpendMetrics && departmentSpendMetrics.length > 0;

  return (
    <div className="p-6 md:p-8 flex flex-col gap-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome back. Here's what's happening with your procurement processes.</p>
      </div>

      <ProcureToPayJourney />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend (YTD)</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">$1.2M</div>
            <p className="text-xs text-emerald-600 mt-1">+12.5% vs last year</p>
          </CardContent>
        </Card>
        
        <Link to="/app/intake?filter=active" className="group">
          <Card className="h-full border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Requests</CardTitle>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/15 transition-colors">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{activeRequestsCount}</div>
              <p className="text-xs text-blue-600 mt-1 group-hover:underline">View all active →</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/intake?filter=pending" className="group">
          <Card className="h-full border-border/60 hover:border-amber-300/50 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/15 transition-colors">
                <CheckCircle className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{pendingApprovalsCount}</div>
              <p className="text-xs text-amber-600 mt-1 group-hover:underline">Needs attention →</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/suppliers" className="group">
          <Card className="h-full border-border/60 hover:border-emerald-300/50 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Suppliers</CardTitle>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/15 transition-colors">
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{activeSuppliersCount}</div>
              <p className="text-xs text-emerald-600 mt-1 group-hover:underline">View directory →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Spend Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {hasSpendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendMetrics} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                  <Tooltip />
                  <Area type="monotone" dataKey="spend" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Loading data...</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentApprovals.map((item, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0 cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                  onClick={() => navigate(`/app/intake?id=${item.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.amount}</p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={
                      item.status === 'Approved' 
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" 
                        : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Spending Trends by Department</CardTitle>
            <CardDescription>Quarterly spending breakdown across different business units</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {hasDepartmentData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentSpendMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="department" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="q1" name="Q1" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="q2" name="Q2" fill="#82ca9d" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="q3" name="Q3" fill="#ffc658" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="q4" name="Q4" fill="#ff8042" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Loading data...</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Procurement Velocity (Last 30 Days)</CardTitle>
            <CardDescription>Number of requisitions submitted vs. approved over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={procurementVelocityData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#8884d8" strokeWidth={2} fillOpacity={1} fill="url(#colorSubmitted)" />
                <Area type="monotone" dataKey="approved" name="Approved" stroke="#82ca9d" strokeWidth={2} fillOpacity={1} fill="url(#colorApproved)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
