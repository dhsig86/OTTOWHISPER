import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

const CONSENT_KEY = 'otto_whisper_consent_v1'

interface ConsentBannerProps {
  onConfirm: () => void
}

/**
 * Banner LGPD obrigatório antes de qualquer gravação.
 * O consentimento é persistido em sessionStorage para não repetir
 * o banner na mesma visita/sessão do browser.
 * (sessionStorage é apagado ao fechar a aba — adequado para dados de saúde)
 */
export function useConsent(): { consentGiven: boolean; giveConsent: () => void } {
  const [consentGiven, setConsentGiven] = useState(() => {
    try {
      return sessionStorage.getItem(CONSENT_KEY) === 'true'
    } catch {
      return false
    }
  })

  const giveConsent = () => {
    try {
      sessionStorage.setItem(CONSENT_KEY, 'true')
    } catch {
      // sessionStorage indisponível (modo privado restrito) — segue sem persistir
    }
    setConsentGiven(true)
  }

  return { consentGiven, giveConsent }
}

export default function ConsentBanner({ onConfirm }: ConsentBannerProps) {
  // Bloqueia scroll da página enquanto o banner está aberto
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-otto-light flex items-center justify-center shrink-0">
            <ShieldCheck className="text-otto-primary" size={20} />
          </div>
          <h2 className="text-base font-bold text-otto-text">
            Aviso de Privacidade — LGPD
          </h2>
        </div>

        <p className="text-sm text-otto-muted leading-relaxed mb-3">
          Esta consulta será <strong className="text-otto-text">gravada e transcrita</strong> pelo
          OTTO Whisper para geração automática de resumo clínico.
        </p>

        <ul className="text-sm text-otto-muted space-y-1.5 mb-5 pl-4 list-disc">
          <li>O áudio <strong className="text-otto-text">não é armazenado</strong> — apenas a transcrição em texto.</li>
          <li>Os dados ficam vinculados à conta do médico responsável.</li>
          <li>O paciente foi informado e consentiu com a gravação.</li>
          <li>O consentimento é válido para esta sessão.</li>
        </ul>

        <p className="text-xs text-otto-muted mb-5 bg-otto-bg rounded-lg p-3">
          Ao confirmar, o médico declara ter obtido o <strong>consentimento verbal</strong> do
          paciente conforme o Art. 11 da LGPD (Lei nº 13.709/2018) —
          dado de saúde é dado sensível.
        </p>

        <button
          onClick={onConfirm}
          className="w-full py-3 bg-otto-primary text-white rounded-xl font-semibold hover:bg-otto-dark transition-colors"
        >
          Confirmar — paciente ciente e de acordo
        </button>
      </div>
    </div>
  )
}
