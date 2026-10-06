import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PushToTalk from './recipes/push-to-talk'
import VoiceForm from './recipes/voice-form'
import DocumentQA from './recipes/document-qa'
import GuidedOnboarding from './recipes/guided-onboarding'
import LanguagePractice from './recipes/language-practice'
import InterviewRehearsal from './recipes/interview-rehearsal'
import ProductSearch from './recipes/product-search'
import AudioNarration from './recipes/audio-narration'
import { recipes } from '../expansion/catalog'
import './recipes.css'

const components = [
  PushToTalk,
  VoiceForm,
  DocumentQA,
  GuidedOnboarding,
  LanguagePractice,
  InterviewRehearsal,
  ProductSearch,
  AudioNarration,
]

function RecipePreviews() {
  const requested = new URLSearchParams(location.search).get('recipe')
  const [slug, setSlug] = useState(recipes.find(([id]) => id === requested)?.[0] ?? recipes[0][0])
  const Component = components[recipes.findIndex(([id]) => id === slug)]
  return (
    <>
      <nav className="recipe-picker" aria-label="Recipe preview">
        <label htmlFor="recipe-picker">Recipe</label>
        <select
          id="recipe-picker"
          value={slug}
          onChange={(event) => {
            const next = event.target.value as typeof slug
            history.replaceState(null, '', `?recipe=${next}`)
            setSlug(next)
          }}
        >
          {recipes.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <a href={`/docs/recipes/${slug}`} target="_top">
          Setup and React source ↗
        </a>
      </nav>
      <Component key={slug} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecipePreviews />
  </StrictMode>,
)
