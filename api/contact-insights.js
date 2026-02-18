import { createClient } from "@supabase/supabase-js";
import {
    buildEvaluationMemoryAnswers,
    sanitizeEvaluationQuestionNumbers,
} from "../src/utils/evaluationPanelData.js";

let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url =
            process.env.SUPABASE_URL ||
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL;
        const key =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Score how well a property matches a contact's preferences
 */
function scorePropertyMatch(property, preferences) {
    let score = 0;
    let maxScore = 0;
    const reasons = [];

    // Budget match (weight: 40%)
    if (preferences.budget) {
        maxScore += 40;
        const budget = parseFloat(preferences.budget);
        const price = parseFloat(property.price);
        if (!isNaN(budget) && !isNaN(price) && budget > 0) {
            const ratio = price / budget;
            if (ratio >= 0.7 && ratio <= 1.3) {
                // Within 30% of budget
                score += 40 * (1 - Math.abs(1 - ratio) / 0.3);
                reasons.push(`Within budget range (₱${parseInt(price).toLocaleString()})`);
            } else if (ratio < 0.7) {
                score += 20; // Under budget is still okay
                reasons.push("Under budget");
            }
        }
    }

    // Location match (weight: 30%)
    if (preferences.location) {
        maxScore += 30;
        const prefLoc = preferences.location.toLowerCase();
        const propAddr = (property.address || "").toLowerCase();
        const propTitle = (property.title || "").toLowerCase();
        if (propAddr.includes(prefLoc) || propTitle.includes(prefLoc)) {
            score += 30;
            reasons.push(`Location match: ${preferences.location}`);
        } else {
            // Partial match - check individual words
            const locWords = prefLoc.split(/[\s,]+/).filter(w => w.length > 2);
            const matchedWords = locWords.filter(w => propAddr.includes(w) || propTitle.includes(w));
            if (matchedWords.length > 0) {
                score += 30 * (matchedWords.length / locWords.length);
                reasons.push(`Partial location match`);
            }
        }
    }

    // Bedroom match (weight: 15%)
    if (preferences.bedrooms) {
        maxScore += 15;
        const prefBed = parseInt(preferences.bedrooms);
        const propBed = parseInt(property.bedrooms);
        if (!isNaN(prefBed) && !isNaN(propBed)) {
            if (propBed === prefBed) {
                score += 15;
                reasons.push(`${propBed} bedrooms (exact match)`);
            } else if (Math.abs(propBed - prefBed) <= 1) {
                score += 10;
                reasons.push(`${propBed} bedrooms (close match)`);
            }
        }
    }

    // Bathroom match (weight: 5%)
    if (preferences.bathrooms) {
        maxScore += 5;
        const prefBath = parseInt(preferences.bathrooms);
        const propBath = parseInt(property.bathrooms);
        if (!isNaN(prefBath) && !isNaN(propBath)) {
            if (propBath >= prefBath) {
                score += 5;
                reasons.push(`${propBath} bathrooms`);
            }
        }
    }

    // Floor area match (weight: 10%)
    if (preferences.floorArea || preferences.floor_area) {
        maxScore += 10;
        const prefArea = parseFloat(preferences.floorArea || preferences.floor_area);
        const propArea = parseFloat(property.floor_area);
        if (!isNaN(prefArea) && !isNaN(propArea) && prefArea > 0) {
            const ratio = propArea / prefArea;
            if (ratio >= 0.7 && ratio <= 1.5) {
                score += 10 * (1 - Math.abs(1 - ratio) / 0.5);
                reasons.push(`${propArea}sqm floor area`);
            }
        }
    }

    // If no preferences extracted, score based on property quality
    // If no preferences extracted, score based on property quality but keep percentage LOW
    if (maxScore === 0) {
        maxScore = 100;
        // Give baseline score based on property completeness, but scaled down
        // so it doesn't look like a high-confidence match (max ~10%)
        if (property.price) score += 2;
        if (property.images?.length > 0) score += 2;
        if (property.bedrooms) score += 1;
        if (property.bathrooms) score += 1;
        if (property.description) score += 1;

        // Ensure at least 1% if it's a valid property so it shows up
        if (score === 0) score = 1;

        reasons.push("New recommendation (waiting for preferences)");
    }

    return {
        propertyId: property.id,
        title: property.title,
        address: property.address,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        floorArea: property.floor_area,
        image: property.images?.[0] || null,
        matchScore: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
        reasons,
    };
}

/**
 * Extract contact preferences from conversation data
 */
function extractPreferences(conversation) {
    const prefs = {};
    const details = conversation.extracted_details || {};
    const analysis = conversation.ai_analysis || {};

    // From extracted_details
    if (details.budget) prefs.budget = details.budget;
    if (details.location) prefs.location = details.location;
    if (details.bedrooms) prefs.bedrooms = details.bedrooms;
    if (details.bathrooms) prefs.bathrooms = details.bathrooms;
    if (details.floor_area || details.floorArea) prefs.floorArea = details.floor_area || details.floorArea;
    if (details.property_type) prefs.propertyType = details.property_type;

    // From ai_analysis (override if more specific)
    if (analysis.budget && !prefs.budget) prefs.budget = analysis.budget;
    if (analysis.preferred_location && !prefs.location) prefs.location = analysis.preferred_location;
    if (analysis.bedrooms && !prefs.bedrooms) prefs.bedrooms = analysis.bedrooms;
    if (analysis.preferences) {
        // AI analysis might have a structured preferences object
        const ap = analysis.preferences;
        if (ap.budget && !prefs.budget) prefs.budget = ap.budget;
        if (ap.location && !prefs.location) prefs.location = ap.location;
        if (ap.bedrooms && !prefs.bedrooms) prefs.bedrooms = ap.bedrooms;
        if (ap.bathrooms && !prefs.bathrooms) prefs.bathrooms = ap.bathrooms;
    }

    return prefs;
}

async function loadEvaluationQuestions(db) {
    let questions = [];

    try {
        const { data: configRows } = await db
            .from("settings")
            .select("value")
            .eq("key", "ai_chatbot_config")
            .limit(1);

        const configQuestions = configRows?.[0]?.value?.evaluation_questions;
        if (Array.isArray(configQuestions) && configQuestions.length > 0) {
            questions = configQuestions;
        }

        if (questions.length === 0) {
            const { data: evalRows } = await db
                .from("settings")
                .select("value")
                .eq("key", "evaluation_questions")
                .limit(1);

            const fallbackQuestions = evalRows?.[0]?.value?.questions;
            if (Array.isArray(fallbackQuestions) && fallbackQuestions.length > 0) {
                questions = fallbackQuestions;
            }
        }
    } catch (err) {
        console.log("[CONTACT-INSIGHTS] Evaluation question lookup (non-fatal):", err.message);
    }

    return questions
        .map((question) => `${question || ""}`.trim())
        .filter(Boolean);
}

/**
 * Score similarity between two contacts
 */
function scoreContactSimilarity(contact, other) {
    let score = 0;
    let maxScore = 0;
    const matchReasons = [];

    // Label match (weight: 25%)
    maxScore += 25;
    if (contact.ai_label && other.ai_label) {
        if (contact.ai_label === other.ai_label) {
            score += 25;
            matchReasons.push(`Same label: ${other.ai_label}`);
        } else {
            // Partial match for related labels
            const hotLabels = ["hot_lead", "warm_lead", "interested"];
            const coldLabels = ["cold_lead", "unresponsive", "not_interested"];
            const cLabel = contact.ai_label.toLowerCase();
            const oLabel = other.ai_label.toLowerCase();
            if (
                (hotLabels.includes(cLabel) && hotLabels.includes(oLabel)) ||
                (coldLabels.includes(cLabel) && coldLabels.includes(oLabel))
            ) {
                score += 15;
                matchReasons.push(`Similar interest level`);
            }
        }
    }

    // Pipeline stage match (weight: 15%)
    maxScore += 15;
    if (contact.pipeline_stage && other.pipeline_stage) {
        if (contact.pipeline_stage === other.pipeline_stage) {
            score += 15;
            matchReasons.push(`Same stage: ${other.pipeline_stage}`);
        }
    }

    // Budget range match (weight: 25%)
    const contactBudget = extractBudget(contact);
    const otherBudget = extractBudget(other);
    if (contactBudget > 0 && otherBudget > 0) {
        maxScore += 25;
        const ratio = Math.min(contactBudget, otherBudget) / Math.max(contactBudget, otherBudget);
        if (ratio >= 0.5) {
            score += 25 * ratio;
            matchReasons.push(`Similar budget range`);
        }
    }

    // Location interest (weight: 20%)
    const contactLoc = extractLocation(contact);
    const otherLoc = extractLocation(other);
    if (contactLoc && otherLoc) {
        maxScore += 20;
        if (contactLoc.toLowerCase() === otherLoc.toLowerCase()) {
            score += 20;
            matchReasons.push(`Same location interest: ${otherLoc}`);
        } else {
            const cWords = contactLoc.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
            const oWords = otherLoc.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
            const overlap = cWords.filter(w => oWords.includes(w));
            if (overlap.length > 0) {
                score += 20 * (overlap.length / Math.max(cWords.length, oWords.length));
                matchReasons.push(`Similar location interest`);
            }
        }
    }

    // Lead status match (weight: 15%)
    maxScore += 15;
    if (contact.lead_status && other.lead_status && contact.lead_status === other.lead_status) {
        score += 15;
        matchReasons.push(`Same lead status`);
    }

    return {
        score: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
        reasons: matchReasons,
    };
}

function extractBudget(conv) {
    const details = conv.extracted_details || {};
    const analysis = conv.ai_analysis || {};
    const budget = details.budget || analysis.budget || analysis.preferences?.budget;
    if (!budget) return 0;
    const num = parseFloat(String(budget).replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : num;
}

function extractLocation(conv) {
    const details = conv.extracted_details || {};
    const analysis = conv.ai_analysis || {};
    return details.location || analysis.preferred_location || analysis.preferences?.location || "";
}

/**
 * Build success path from conversation history
 */
async function buildSuccessPath(db, conversation) {
    const milestones = [];
    const convId = conversation.conversation_id;

    // Get message timestamps to build timeline
    const { data: msgs } = await db
        .from("facebook_messages")
        .select("message_text, is_from_page, timestamp")
        .eq("conversation_id", convId)
        .order("timestamp", { ascending: true })
        .limit(50);

    if (!msgs || msgs.length === 0) return milestones;

    const firstMsg = new Date(msgs[0].timestamp);

    // Milestone 1: First contact
    milestones.push({
        day: 0,
        event: "First message",
        icon: "💬",
        detail: msgs[0].is_from_page ? "Page initiated" : "Customer initiated",
    });

    // Milestone 2: First reply (engagement)
    const firstReply = msgs.find((m, i) => i > 0 && m.is_from_page !== msgs[0].is_from_page);
    if (firstReply) {
        const days = Math.round((new Date(firstReply.timestamp) - firstMsg) / (1000 * 60 * 60 * 24));
        milestones.push({
            day: days,
            event: "Replied",
            icon: "↩️",
            detail: `Customer engaged on day ${days}`,
        });
    }

    // Check for property interest signals in messages
    const propertyKeywords = ["property", "house", "unit", "condo", "bed", "bath", "price", "how much", "magkano"];
    const interestMsg = msgs.find(m =>
        !m.is_from_page && propertyKeywords.some(kw => (m.message_text || "").toLowerCase().includes(kw))
    );
    if (interestMsg) {
        const days = Math.round((new Date(interestMsg.timestamp) - firstMsg) / (1000 * 60 * 60 * 24));
        milestones.push({
            day: days,
            event: "Showed property interest",
            icon: "🏠",
            detail: "Asked about properties",
        });
    }

    // Check for booking signals
    const bookingKeywords = ["book", "schedule", "appointment", "visit", "viewing", "meet"];
    const bookingMsg = msgs.find(m =>
        (m.message_text || "").toLowerCase().match(new RegExp(bookingKeywords.join("|")))
    );
    if (bookingMsg) {
        const days = Math.round((new Date(bookingMsg.timestamp) - firstMsg) / (1000 * 60 * 60 * 24));
        milestones.push({
            day: days,
            event: "Booking discussed",
            icon: "📅",
            detail: "Booking/viewing mentioned",
        });
    }

    // Current status milestone
    const stage = conversation.pipeline_stage;
    const stageIcons = {
        new: "🆕",
        contacted: "📞",
        interested: "⭐",
        booked: "📅",
        converted: "🎉",
        lost: "🚫",
    };
    const totalDays = Math.round((Date.now() - firstMsg) / (1000 * 60 * 60 * 24));

    if (stage && stage !== "new") {
        milestones.push({
            day: totalDays,
            event: stage === "booked" ? "Booked!" : stage === "converted" ? "Converted!" : `Stage: ${stage}`,
            icon: stageIcons[stage] || "📌",
            detail: `Reached ${stage} stage`,
        });
    }

    // Deduplicate and sort by day
    const seen = new Set();
    return milestones
        .filter(m => {
            const key = m.event;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.day - b.day);
}

/**
 * Main API handler
 */
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { conversationId } = req.query;
    if (!conversationId) {
        return res.status(400).json({ error: "conversationId required" });
    }

    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "Database not configured" });

    try {
        // 1. Get the target conversation
        const { data: conversation, error: convErr } = await db
            .from("facebook_conversations")
            .select("conversation_id, participant_name, participant_id, page_id, ai_label, pipeline_stage, lead_status, extracted_details, ai_analysis, ai_summary, evaluation_score")
            .eq("conversation_id", conversationId)
            .single();

        if (convErr || !conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        // 2. Extract preferences from this contact
        const preferences = extractPreferences(conversation);

        // 2.5 Build evaluation memory payload for the sidebar panel
        const evaluationQuestions = await loadEvaluationQuestions(db);
        const answeredQuestionNumbers = sanitizeEvaluationQuestionNumbers(
            conversation?.extracted_details?.evaluation_answered_questions,
            evaluationQuestions.length,
        );
        const evaluationAnswers = buildEvaluationMemoryAnswers(
            evaluationQuestions,
            answeredQuestionNumbers,
        );
        const rawEvalScore = Number(conversation?.evaluation_score);
        const computedEvalScore =
            evaluationQuestions.length > 0
                ? Math.round((answeredQuestionNumbers.length / evaluationQuestions.length) * 100)
                : 0;
        const evaluationScore = Number.isFinite(rawEvalScore)
            ? rawEvalScore
            : computedEvalScore;

        // Resolve tenant scope from the conversation's page
        let pageScope = { team_id: null, organization_id: null };
        if (conversation.page_id) {
            const { data: pageData } = await db
                .from("facebook_pages")
                .select("team_id, organization_id")
                .eq("page_id", conversation.page_id)
                .maybeSingle();
            pageScope = {
                team_id: pageData?.team_id || null,
                organization_id: pageData?.organization_id || null,
            };
        }

        // 3. Get active properties for the SAME tenant scope
        let properties = [];
        if (pageScope.team_id || pageScope.organization_id) {
            let propertyQuery = db
                .from("properties")
                .select("id, title, address, price, bedrooms, bathrooms, floor_area, description, images, status")
                .eq("status", "For Sale")
                .order("created_at", { ascending: false })
                .limit(50);

            if (pageScope.team_id) {
                propertyQuery = propertyQuery.eq("team_id", pageScope.team_id);
            } else {
                propertyQuery = propertyQuery.eq("organization_id", pageScope.organization_id);
            }

            const { data: scopedProperties } = await propertyQuery;
            properties = scopedProperties || [];
        }

        // 4. Score and rank properties
        let propertyMatches = [];
        if (properties && properties.length > 0) {
            propertyMatches = properties
                .map(p => scorePropertyMatch(p, preferences))
                .sort((a, b) => b.matchScore - a.matchScore)
                .slice(0, 3);
        }

        // 5. Get other conversations FROM THE SAME PAGE for similarity matching
        const { data: allConversations } = await db
            .from("facebook_conversations")
            .select("conversation_id, participant_name, participant_id, page_id, ai_label, pipeline_stage, lead_status, extracted_details, ai_analysis, ai_summary, last_message_time")
            .eq("page_id", conversation.page_id)
            .neq("conversation_id", conversationId)
            .order("last_message_time", { ascending: false })
            .limit(200);

        // 6. Score similarity with each contact, prioritizing successful ones
        let similarContacts = [];
        if (allConversations && allConversations.length > 0) {
            const scored = allConversations.map(other => {
                const { score, reasons } = scoreContactSimilarity(conversation, other);
                // Bonus for successful conversions
                const successBonus =
                    other.pipeline_stage === "converted" ? 15 :
                        other.pipeline_stage === "booked" ? 10 :
                            other.pipeline_stage === "interested" ? 5 : 0;

                return {
                    conversationId: other.conversation_id,
                    name: other.participant_name || "Unknown",
                    label: other.ai_label,
                    stage: other.pipeline_stage,
                    leadStatus: other.lead_status,
                    similarity: Math.min(100, score + successBonus),
                    reasons,
                    isConverted: other.pipeline_stage === "converted" || other.pipeline_stage === "booked",
                };
            });

            // Sort by: converted first, then by similarity
            scored.sort((a, b) => {
                if (a.isConverted !== b.isConverted) return b.isConverted ? 1 : -1;
                return b.similarity - a.similarity;
            });

            // Take top 3 with score > 20%
            const top3 = scored.filter(s => s.similarity > 20).slice(0, 3);

            // Build success paths for top matches
            for (const match of top3) {
                const conv = allConversations.find(c => c.conversation_id === match.conversationId);
                if (conv) {
                    match.successPath = await buildSuccessPath(db, conv);
                }
            }

            similarContacts = top3;
        }

        return res.status(200).json({
            contactName: conversation.participant_name,
            preferences,
            propertyMatches,
            similarContacts,
            evaluation: {
                score: evaluationScore,
                questions: evaluationQuestions,
                answers: evaluationAnswers,
                answeredQuestionNumbers,
                answeredCount: answeredQuestionNumbers.length,
            },
        });
    } catch (error) {
        console.error("[CONTACT-INSIGHTS] Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
