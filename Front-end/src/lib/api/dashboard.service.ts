/**
 * Service API Dashboard
 *
 * Appels HTTP vers le backend NestJS pour récupérer les statistiques du dashboard
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  presentToday: number;
  absentToday: number;
  pendingPayments: number;
  totalRevenue: number;
  recentStudents?: any[];
  recentPayments?: any[];
  attendanceRate?: number;
  paymentRate?: number;
}

/**
 * Récupérer les statistiques du dashboard
 */
export async function getDashboardStats(token: string) {
  const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch dashboard stats' }));
    throw new Error(error.message || 'Failed to fetch dashboard stats');
  }

  return await response.json();
}

/**
 * Récupérer les statistiques d'une période donnée
 */
export async function getStatsForPeriod(token: string, startDate: string, endDate: string) {
  const queryParams = new URLSearchParams({
    startDate,
    endDate,
  });

  const response = await fetch(`${API_BASE_URL}/dashboard/stats/period?${queryParams}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch period stats' }));
    throw new Error(error.message || 'Failed to fetch period stats');
  }

  return await response.json();
}

/**
 * Récupérer les activités récentes
 */
export async function getRecentActivities(token: string, limit: number = 10) {
  const response = await fetch(`${API_BASE_URL}/dashboard/activities?limit=${limit}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch recent activities' }));
    throw new Error(error.message || 'Failed to fetch recent activities');
  }

  return await response.json();
}

/**
 * Récupérer les données du graphique paiements (6 derniers mois)
 */
export async function getPaymentsChartData(token: string) {
  const response = await fetch(`${API_BASE_URL}/dashboard/charts/payments`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch payments chart data' }));
    throw new Error(error.message || 'Failed to fetch payments chart data');
  }

  return await response.json();
}

/**
 * Récupérer les données du graphique présences (6 derniers mois)
 */
export async function getAttendanceChartData(token: string) {
  const response = await fetch(`${API_BASE_URL}/dashboard/charts/attendance`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch attendance chart data' }));
    throw new Error(error.message || 'Failed to fetch attendance chart data');
  }

  return await response.json();
}

/**
 * Récupérer la distribution des élèves par classe
 */
export async function getStudentsDistribution(token: string) {
  const response = await fetch(`${API_BASE_URL}/dashboard/charts/students-distribution`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch students distribution' }));
    throw new Error(error.message || 'Failed to fetch students distribution');
  }

  return await response.json();
}
