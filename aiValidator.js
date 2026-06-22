// AI Validation module for calling OpenAI (GPT-4o-mini) and Gemini API endpoints
window.AiValidator = (function () {

  const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

  // Using gemini-1.5-flash as it is fast, stable, and cost-effective
  function getGeminiUrl(key) {
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  }

  // Clean JSON response from potential markdown wrapping
  function cleanJsonString(str) {
    if (!str) return "";
    let cleaned = str.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
      cleaned = cleaned.replace(/\n?```$/, "");
    }
    return cleaned.trim();
  }

  const SYSTEM_PROMPT = `You are an expert chemical engineering and RTD (Residence Time Distribution) metadata auditor.

Your task is NOT to enrich metadata aggressively.

Your primary task is to VALIDATE whether each field in the provided "domain_metadata" is correct and explicitly supported by the supplied text chunk.

DEFINITION OF "CORRECT" VALUE:
- A field value in the metadata is correct if and only if it is explicitly stated in the provided text chunk. 
- Any value in the original metadata that is incorrect, unsupported, or missing from the text chunk must be corrected or set to null, empty string "", or empty array [] depending on its type.
- Do NOT assume standard domain conventions or default settings. For example, do not assume "pulse injection" was used as the injection method or that "colored dyes" were used as the tracer just because they are common in RTD literature, unless the text chunk explicitly states this. If the text does not mention them, set the value to null or empty.

IMPORTANT PRINCIPLES

1. Evidence-first extraction
- Only extract information that is explicitly stated in the text.
- Do NOT infer experimental details from general RTD knowledge.
- Do NOT infer reactor types, flow models, tracer methods, operating conditions, or model parameters unless they are directly mentioned.
- If a field cannot be supported from the chunk alone, leave it empty.

2. Chunk-level validation
- Evaluate only the supplied text chunk.
- Do NOT use information that may exist elsewhere in the paper.
- Do NOT use document title, section title, prior chunks, or domain knowledge unless the information appears in the chunk text itself.

3. Conservative correction policy
- Keep existing values if they are supported by the text.
- Remove values that are unsupported.
- Add values only when directly justified by the text.
- Prefer empty lists [] or empty strings "" over speculative values.

4. Distinguish discussion from execution
- If a chunk discusses a model, reactor, or methodology, that does NOT mean it was experimentally used.
- For example:
  - A review of PFR and CSTR models does not imply a PFR or CSTR experiment was performed.
  - Mentioning pulse-response RTD theory does not imply pulse injection was used.
  - Mentioning a tracer method does not imply that tracer was used in this study.

5. Field-specific rules

reactor_type
- Populate only if explicitly identified.

reactor_name
- Populate only if explicitly named.

reactor_geometry
- Populate only if geometry is described.

reactor_material
- Populate only if material is described.

flow_regime
- Populate only if explicitly stated.

system_assumptions
- Include modeling assumptions explicitly mentioned.
- Examples:
  - no radial mixing
  - steady state
  - incompressible flow

boundary_conditions
- Populate only if stated.

variables
- Include scientifically meaningful variables explicitly discussed.
- Examples:
  - Reynolds number
  - Peclet number
  - mean residence time
  - aspect ratio
  - volumetric flow rate
- Do not invent variables.

operating_conditions
- Include actual operating conditions only.
- Examples:
  - temperature
  - flow rate
  - screw speed
  - throughput
- Statistical descriptors such as MRT or variance are NOT operating conditions.

dimensionless_numbers
- Include only explicitly mentioned dimensionless numbers.

experimental_setup
- Populate only if the experiment details are explicitly described.
- Do not infer tracer type, injection method, detection method, or detection location.

rtd_functions_discussed
- Include RTD models or RTD function types explicitly discussed.

residence_time_data
- Populate only if actual RTD metrics or values are discussed.
- Leave values null when not reported.

flow_model
- Include only models explicitly described.
- Do not add model parameters that are not stated.

parameter_correlations
- Include only explicit relationships or correlations described in the text.

key_findings
- Summarize only findings explicitly stated in the chunk.

HALLUCINATION CHECK

Before finalizing:
- Remove any value that cannot be traced to explicit text evidence.
- If uncertain whether a value is supported, remove it.
- Absence of evidence is NOT evidence.

OUTPUT FORMAT

Return ONLY valid JSON.

{
  "corrected_metadata": {
    "...": "..."
  },
  "corrections_description": [
    {
      "field": "<field_name>",
      "issue": "<why original value was wrong or incomplete>",
      "correction": "<what was changed>"
    }
  ],
  "evidence_summary": [
    {
      "field": "<field_name>",
      "supporting_text": "<short quote from chunk>"
    }
  ]
}

Return only the raw JSON object conforming to the schema above, with no extra text, explanations, or wrapper.`;

  async function callOpenAI(text, domainMetadata, apiKey) {
    const userPrompt = `Research Paper Text Chunk:
[TEXT_START]
${text}
[TEXT_END]

Original LLM-Extracted Metadata (domain_metadata):
${JSON.stringify(domainMetadata, null, 2)}`;

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content.trim();
    return JSON.parse(cleanJsonString(resultText));
  }

  async function callGemini(text, domainMetadata, apiKey) {
    const prompt = `${SYSTEM_PROMPT}

Research Paper Text Chunk:
[TEXT_START]
${text}
[TEXT_END]

Original LLM-Extracted Metadata (domain_metadata):
${JSON.stringify(domainMetadata, null, 2)}`;

    const response = await fetch(getGeminiUrl(apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error("Invalid response format received from Gemini API");
    }

    const resultText = data.candidates[0].content.parts[0].text.trim();
    return JSON.parse(cleanJsonString(resultText));
  }

  async function validateMetadata(text, domainMetadata, openaiKey, geminiKey) {
    if (!openaiKey && !geminiKey) {
      throw new Error("Missing API Credentials. Please configure OpenAI or Gemini API Keys in settings.");
    }

    // Try OpenAI first if key is provided
    if (openaiKey) {
      try {
        console.log("Calling OpenAI GPT-4o-mini...");
        const result = await callOpenAI(text, domainMetadata, openaiKey);
        return {
          modelUsed: "GPT-4o-mini",
          rawResponse: result,
          corrected_metadata: result.corrected_metadata || result.correctedMetadata,
          corrections_description: result.corrections_description || result.correctionsDescription,
          evidence_summary: result.evidence_summary || result.evidenceSummary || result.source_quotes || result.sourceQuotes
        };
      } catch (err) {
        console.warn("OpenAI call failed, checking if Gemini fallback is available...", err);
        if (geminiKey) {
          try {
            console.log("Calling Gemini Fallback...");
            const result = await callGemini(text, domainMetadata, geminiKey);
            return {
              modelUsed: "Gemini Fallback (OpenAI error)",
              rawResponse: result,
              corrected_metadata: result.corrected_metadata || result.correctedMetadata,
              corrections_description: result.corrections_description || result.correctionsDescription,
              evidence_summary: result.evidence_summary || result.evidenceSummary || result.source_quotes || result.sourceQuotes
            };
          } catch (geminiErr) {
            throw new Error(`Both OpenAI and Gemini APIs failed. OpenAI error: ${err.message}. Gemini error: ${geminiErr.message}`);
          }
        } else {
          throw new Error(`OpenAI API call failed, and no Gemini API Key is configured for fallback. Error: ${err.message}`);
        }
      }
    } else {
      // Direct call to Gemini if only Gemini key is provided
      try {
        console.log("Calling Gemini directly (No OpenAI key provided)...");
        const result = await callGemini(text, domainMetadata, geminiKey);
        return {
          modelUsed: "Gemini",
          rawResponse: result,
          corrected_metadata: result.corrected_metadata || result.correctedMetadata,
          corrections_description: result.corrections_description || result.correctionsDescription,
          evidence_summary: result.evidence_summary || result.evidenceSummary || result.source_quotes || result.sourceQuotes
        };
      } catch (err) {
        throw new Error(`Gemini API call failed: ${err.message}`);
      }
    }
  }

  async function testValidator(simulateFallback = false) {
    console.log("Starting validator unit test...");
    const text = "The flow rate of the reactor was maintained at 5.5 mL/min at a temperature of 120 C.";
    const domainMetadata = {
      reactor: { type: "tubular reactor" },
      operating_conditions: [
        { parameter: "flow_rate", values: [0.0], unit: "mL/min" },
        { parameter: "temperature", values: [20], unit: "C" }
      ]
    };

    // Save original fetch
    const originalFetch = window.fetch;

    // Mock fetch
    window.fetch = async function (url, options) {
      console.log(`Mock Fetch intercepted call to: ${url}`);

      if (url.includes("api.openai.com")) {
        if (simulateFallback) {
          console.log("Simulating OpenAI failure (e.g. rate limits)...");
          return {
            ok: false,
            status: 429,
            text: async () => "Rate limit exceeded"
          };
        } else {
          return {
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({
                    corrected_metadata: {
                      reactor: { type: "tubular reactor" },
                      operating_conditions: [
                        { parameter: "flow_rate", values: [5.5], unit: "mL/min" },
                        { parameter: "temperature", values: [120], unit: "C" }
                      ]
                    },
                    corrections_description: [
                      { field: "operating_conditions.flow_rate", issue: "flow rate is 0.0 but should be 5.5", correction: "5.5" },
                      { field: "operating_conditions.temperature", issue: "temperature is 20 but should be 120", correction: "120" }
                    ],
                    evidence_summary: [
                      { field: "operating_conditions.flow_rate", supporting_text: "flow rate of the reactor was maintained at 5.5 mL/min" },
                      { field: "operating_conditions.temperature", supporting_text: "temperature of 120 C" }
                    ]
                  })
                }
              }]
            })
          };
        }
      } else if (url.includes("googleapis.com")) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    corrected_metadata: {
                      reactor: { type: "tubular reactor" },
                      operating_conditions: [
                        { parameter: "flow_rate", values: [5.5], unit: "mL/min" },
                        { parameter: "temperature", values: [120], unit: "C" }
                      ]
                    },
                    corrections_description: [
                      { field: "operating_conditions.flow_rate", issue: "flow rate is 0.0 but should be 5.5", correction: "5.5" },
                      { field: "operating_conditions.temperature", issue: "temperature is 20 but should be 120", correction: "120" }
                    ],
                    evidence_summary: [
                      { field: "operating_conditions.flow_rate", supporting_text: "flow rate of the reactor was maintained at 5.5 mL/min" },
                      { field: "operating_conditions.temperature", supporting_text: "temperature of 120 C" }
                    ]
                  })
                }]
              }
            }]
          })
        };
      }
      return originalFetch(url, options);
    };

    try {
      console.log(`Running test (simulateFallback=${simulateFallback})...`);
      const result = await validateMetadata(text, domainMetadata, "mock-openai-key", "mock-gemini-key");
      console.log("Validator test result:", result);
      return { success: true, result };
    } catch (err) {
      console.error("Test failed:", err);
      return { success: false, error: err.message };
    } finally {
      // Restore original fetch
      window.fetch = originalFetch;
    }
  }

  return {
    validateMetadata: validateMetadata,
    testValidator: testValidator
  };

})();
