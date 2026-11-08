import { NextResponse } from 'next/server';
import { resetDemo } from '@/scripts/reset-demo';

export async function POST() {
  try {
    await resetDemo();
    return NextResponse.json({
      success: true,
      message: 'Demo state has been completely reset to default showcase seeds.',
    });
  } catch (error: any) {
    console.error('Demo reset failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to reset demo state' }, { status: 500 });
  }
}
