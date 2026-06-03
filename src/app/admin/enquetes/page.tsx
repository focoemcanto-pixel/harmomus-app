import Link from 'next/link';
import { getAdminHomePolls } from '@/lib/data/home-polls';

export default async function AdminEnquetesPage() {
 const polls = await getAdminHomePolls();
 return (
  <div className='space-y-6'>
   <div className='flex items-center justify-between'>
    <div>
      <h1 className='text-3xl font-bold'>Enquetes</h1>
      <p className='text-sm text-zinc-400'>Gerencie as votações da home.</p>
    </div>
    <Link href='/admin/enquetes/nova' className='rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-black'>Nova enquete</Link>
   </div>
   <div className='grid gap-4'>
    {polls.map((poll)=> (
      <div key={poll.id} className='rounded-2xl border border-white/10 p-5'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='font-semibold text-lg'>{poll.question}</h2>
            <p className='text-sm text-zinc-400'>{poll.totalVotes} votos</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${poll.active ? 'bg-emerald-500/20' : 'bg-zinc-500/20'}`}>
            {poll.active ? 'Ativa' : 'Inativa'}
          </span>
        </div>
      </div>
    ))}
   </div>
  </div>
 )
}
