import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProgressBar from './ProgressBar'
import React from 'react'

describe('ProgressBar Component', () => {
  test('deve renderizar a mensagem e porcentagem de progresso', () => {
    const progress = {
      step: 'transcrevendo',
      pct: 45,
      message: 'Transcrevendo áudio...'
    }
    render(<ProgressBar progress={progress} />)

    expect(screen.getByText(/Transcrevendo áudio\.\.\./i)).toBeDefined()
    expect(screen.getByText(/45%/i)).toBeDefined()
    expect(screen.getByText(/🎙️/i)).toBeDefined()
  })

  test('deve chamar onCancel ao clicar no botao Cancelar', () => {
    const progress = {
      step: 'diarizando',
      pct: 70,
      message: 'Identificando vozes...'
    }
    const handleCancel = vi.fn()
    render(<ProgressBar progress={progress} onCancel={handleCancel} />)

    const cancelButton = screen.getByText(/Cancelar/i)
    fireEvent.click(cancelButton)

    expect(handleCancel).toHaveBeenCalledTimes(1)
  })
})
