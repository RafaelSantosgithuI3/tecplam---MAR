import { ChecklistItem } from './types';

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: '1', category: 'GERAL', text: 'A Instrução de trabalho está disponível na linha de produção?', evidence: '' },
  { id: '2', category: 'PL', text: 'Identificação de PL no manuseio da Bateria (Insp., Tape, Prensa e Parafusamento).', evidence: '' },
  { id: '3', category: 'PL / CTQ', text: 'Identificação de PL e CTQ no posto de Final (Radiação).', evidence: '' },
  { id: '4', category: 'GERAL', text: 'Uso de luvas, pulseira ou dedeira no processo.', evidence: '' },
  { id: '5', category: 'INPUT', text: 'Uso de JIG de pressionamento dos conectores.', evidence: '' },
  { id: '6', category: 'INPUT', text: 'Parafuso alimentado e aterramento do nejico estão conforme.', evidence: '' },
  { id: '7', category: 'INPUT / PRENSA', text: 'Limpeza do berço das automáticas e prensa foi realizada.', evidence: '' },
  { id: '8', category: 'ESD/EOS', text: 'Ionizador ligado em "HIGH" e direcionado para o material de montagem.', evidence: '' },
  { id: '9', category: 'INPUT', text: 'Posição, ligação e limpeza do Ion Blower está correta.', evidence: '' },
  { id: '10', category: 'PRENSA', text: 'Teste de pressionamento da prensa de conectores conforme o modelo.', evidence: '' },
  { id: '11', category: 'PRENSA', text: 'Teste de pressionamento da Back Cover / Rear / Back Glass conforme o modelo.', evidence: '' },
  { id: '12', category: 'IMEI', text: 'Check de verificação de IMEI realizado.', evidence: '' },
  { id: '13', category: 'CN METING', text: 'Data da label Gift não divergente da label/printagem IMEI (Vivo mês corrente; outros até 2 meses).', evidence: 'Checar a primeira peça de cada mudança de SKU.' },
  { id: '14', category: 'PACKING', text: 'Scaneamento do código 2D nas 5 primeiras Gift em trocas (PO, pallet, carbono, impressora).', evidence: '' },
  { id: '15', category: 'GERAL', text: 'Uso de acessórios proibidos na linha (SIM = N/A, NÃO = OK).', evidence: '' },
  { id: '16', category: 'ESD/EOS', text: 'Teste da pulseira e calçado antiestático realizado.', evidence: '' },
  { id: '17', category: 'ESD/EOS', text: 'Funcionários conectados com a pulseira antiestática.', evidence: '' },
  { id: '18', category: 'ESD/EOS', text: 'Cabos de aterramento conectados aos equipamentos.', evidence: '' },
  { id: '19', category: 'GERAL', text: 'Apenas material da cor do modelo corrente nos postos.', evidence: '' },
  { id: '20', category: 'GERAL', text: 'Existência de aparelhos para MDL.', evidence: '' },
  { id: '21', category: 'GERAL', text: 'Registros de equipamentos preenchidos e atualizados.', evidence: '' },
  { id: '22', category: 'GERAL', text: 'Matriz de polivalência contempla todos colaboradores treinados e registrados.', evidence: '' },
];

export const CATEGORIES = Array.from(new Set(CHECKLIST_ITEMS.map(item => item.category)));