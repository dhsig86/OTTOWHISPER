import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConsentBanner from './ConsentBanner'


describe('ConsentBanner Component', () => {
  test('deve renderizar o aviso de privacidade e chamar onConfirm ao clicar no botao', () => {
    const handleConfirm = vi.fn()
    render(<ConsentBanner onConfirm={handleConfirm} />)

    expect(screen.getByText(/Aviso de Privacidade/i)).toBeDefined()
    expect(screen.getByText(/Confirmar — paciente ciente e de acordo/i)).toBeDefined()

    const button = screen.getByText(/Confirmar — paciente ciente e de acordo/i)
    fireEvent.click(button)

    expect(handleConfirm).toHaveBeenCalledTimes(1)
  })
})
