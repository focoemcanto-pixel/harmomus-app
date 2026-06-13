import { CalendarDays } from 'lucide-react';
import { MinistryShell, PremiumPanel } from '@/components/ministerio/ministry-ui';

export default function MinistryAgendaPage() {
 return (
  <MinistryShell>
   <PremiumPanel>
    <div className='flex items-center gap-3'>
      <CalendarDays className='h-6 w-6' />
      <h1 className='text-3xl font-semibold'>Agenda Ministerial</h1>
    </div>
    <p className='mt-4 text-zinc-300'>Próxima etapa: agenda mensal com equipes, coordenador vocal e geração automática de escalas.</p>
   </PremiumPanel>
  </MinistryShell>
 )
}
