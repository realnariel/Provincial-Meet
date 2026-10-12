using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProvMeet.Data;
using ProvMeet.Models;
using ProvMeet.Services;
using System.Security.Claims;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ProvMeet.Controllers
{
    [Authorize(Roles = "Admin,Coordinator")]
    public class DelegationController : Controller
    {
        private readonly ApplicationDbContext _context;

        public DelegationController(ApplicationDbContext context)
        {
            _context = context;
        }

        // Helper method to extract the numerical CoordinatorId
        private int? GetCurrentCoordinatorId()
        {
            var claimValue = User.FindFirst("CoordinatorId")?.Value 
                ?? User.FindFirst("Id")?.Value;

            if (int.TryParse(claimValue, out int parsedId))
            {
                return parsedId;
            }
            return null;
        }

        public async Task<IActionResult> Manage(int eventId)
        {
            var currentCoordinatorId = GetCurrentCoordinatorId();

            var eventDetails = await _context.Events.FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventDetails == null) return NotFound("Event not found.");

            // Security check comparing Assigned Coordinator ID vs Session Coordinator ID
            if (!User.IsInRole("Admin") && (!currentCoordinatorId.HasValue || eventDetails.CoordinatorId != currentCoordinatorId))
            {
                return Forbid(); 
            }

            var qualifiers = await _context.EventQualifiers
                .Where(q => q.EventId == eventId)
                .OrderBy(q => q.Role != "Athlete" ? 1 : 0) // Athletes first, staff at the end
                .ThenByDescending(q => q.Gender == "W" || q.Gender == "Girls") // Girls first, then Boys
                .ThenBy(q => q.Team)
                .ThenBy(q => q.ParticipantName)
                .ToListAsync();

            ViewBag.Event = eventDetails;
            // Teams are registered once. The event supplies Elementary, Secondary, or Paragames.
            ViewBag.Teams = await _context.Teams.AsNoTracking().OrderBy(t => t.Name).ToListAsync();
            
            ViewBag.WinnerCandidates = await GetWinnerCandidates(eventDetails);
            return View(qualifiers);
        }

        private async Task<List<WinnerCandidate>> GetWinnerCandidates(Event current)
        {
            if (string.IsNullOrWhiteSpace(current.SportName)) return new();
            var sport = current.SportName.Trim().ToLower();
            var division = current.Division.Trim().ToLower();
            var events = await _context.Events.AsNoTracking()
                .Where(e => e.SportName != null && e.SportName.Trim().ToLower() == sport
                    && e.Division.Trim().ToLower() == division).ToListAsync();
            var teams = await _context.Teams.AsNoTracking().ToListAsync();
            return PlayerMedals.Build(events, teams).Where(x => x.Medal != "Gold")
                .GroupBy(x => new { Name = x.Player.ToUpperInvariant(), Team = x.Team.ToUpperInvariant(), x.Category })
                .Select(g => new WinnerCandidate(g.OrderBy(x => x.MedalOrder).ThenBy(x => x.EventId).First()))
                .OrderBy(x => x.Result.Player).ThenBy(x => x.Result.Team).ToList();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddRecordedWinners(int eventId, List<string> selectedWinners)
        {
            var current = await _context.Events.FirstOrDefaultAsync(e => e.Id == eventId);
            if (current == null) return NotFound();
            var coordinatorId = GetCurrentCoordinatorId();
            if (!User.IsInRole("Admin") && (!coordinatorId.HasValue || current.CoordinatorId != coordinatorId)) return Forbid();

            var candidates = (await GetWinnerCandidates(current)).ToDictionary(x => x.Key);
            var keys = (selectedWinners ?? new()).Distinct().ToList();
            if (keys.Any(key => !candidates.ContainsKey(key)))
                return BadRequest("A selected winner is no longer available. Reload the page and select again.");
            var existing = await _context.EventQualifiers.Where(q => q.EventId == eventId).ToListAsync();
            var known = existing.Where(q => ParticipantRoles.Order(q.Role) == 0)
                .Select(q => (PlayerMedals.Normalize(q.ParticipantName).ToUpperInvariant(), PlayerMedals.Normalize(q.Team).ToUpperInvariant())).ToHashSet();
            var added = 0;
            foreach (var key in keys)
            {
                var winner = candidates[key].Result;
                if (!known.Add((winner.Player.ToUpperInvariant(), winner.Team.ToUpperInvariant()))) continue;
                _context.EventQualifiers.Add(new EventQualifier {
                    Id = Guid.NewGuid(), EventId = eventId, ParticipantName = winner.Player,
                    Team = winner.Team, School = winner.School, Role = "Athlete",
                    Gender = winner.Category == "Boys" ? "M" : winner.Category == "Girls" ? "W" : null,
                    UpdatedAt = DateTime.UtcNow
                });
                added++;
            }
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = $"Added {added} participant(s). Existing athletes were skipped.";
            return RedirectToAction(nameof(Manage), new { eventId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SaveQualifier(EventQualifier model)
        {
            var currentCoordinatorId = GetCurrentCoordinatorId();

            var eventDetails = await _context.Events.FirstOrDefaultAsync(e => e.Id == model.EventId);
            if (eventDetails == null) return NotFound("Event not found.");

            // Security check for saving records
            if (!User.IsInRole("Admin") && (!currentCoordinatorId.HasValue || eventDetails.CoordinatorId != currentCoordinatorId))
            {
                return Forbid();
            }

            if (!string.IsNullOrWhiteSpace(model.ParticipantName))
            {
                model.ParticipantName = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(model.ParticipantName.Trim().ToLowerInvariant());
            }

            if (string.IsNullOrWhiteSpace(model.Role))
            {
                model.Role = "Athlete";
            }

            // Automatically determine gender based on event title if not set
            if (string.IsNullOrWhiteSpace(model.Gender) && !string.IsNullOrEmpty(eventDetails.Title))
            {
                if (eventDetails.Title.Contains("boys", StringComparison.OrdinalIgnoreCase))
                {
                    model.Gender = "M";
                }
                else if (eventDetails.Title.Contains("girls", StringComparison.OrdinalIgnoreCase))
                {
                    model.Gender = "W";
                }
            }

            model.SpecificDistrict = string.IsNullOrWhiteSpace(model.SpecificDistrict) ? null : model.SpecificDistrict.Trim();
            model.UpdatedAt = DateTime.UtcNow;

            if (model.Id == Guid.Empty)
            {
                model.Id = Guid.NewGuid();
                _context.EventQualifiers.Add(model);
                TempData["SuccessMessage"] = "New participant successfully added.";
            }
            else
            {
                var existing = await _context.EventQualifiers
                    .FirstOrDefaultAsync(q => q.Id == model.Id && q.EventId == model.EventId);
                if (existing == null) return NotFound("Participant not found in this event.");
                existing.ParticipantName = model.ParticipantName;
                existing.Team = model.Team;
                existing.SpecificDistrict = model.SpecificDistrict;
                existing.Role = model.Role;
                existing.School = model.School;
                existing.Gender = model.Gender;
                existing.TshirtSize = model.TshirtSize;
                existing.UpdatedAt = model.UpdatedAt;
            }

            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Manage), new { eventId = model.EventId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> BulkSave(List<EventQualifier> qualifiers, int eventId)
        {
            var currentCoordinatorId = GetCurrentCoordinatorId();

            var eventDetails = await _context.Events.FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventDetails == null) return NotFound("Event not found.");

            if (!User.IsInRole("Admin") && (!currentCoordinatorId.HasValue || eventDetails.CoordinatorId != currentCoordinatorId))
            {
                return Forbid();
            }

            if (qualifiers != null && qualifiers.Any())
            {
                foreach (var q in qualifiers)
                {
                    var existing = await _context.EventQualifiers.FirstOrDefaultAsync(x => x.Id == q.Id && x.EventId == eventId);
                    if (existing != null)
                    {
                        var pName = string.IsNullOrWhiteSpace(q.ParticipantName) ? "" : System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(q.ParticipantName.Trim().ToLowerInvariant());
                        existing.ParticipantName = pName;
                        existing.Team = q.Team;         // Maps to the "district" column in the DB
                        existing.SpecificDistrict = string.IsNullOrWhiteSpace(q.SpecificDistrict) ? null : q.SpecificDistrict.Trim();
                        existing.Role = string.IsNullOrWhiteSpace(q.Role) ? "Athlete" : q.Role;
                        existing.TshirtSize = q.TshirtSize;
                        if (!string.IsNullOrWhiteSpace(q.Gender)) existing.Gender = q.Gender;
                        existing.UpdatedAt = DateTime.UtcNow;
                        _context.EventQualifiers.Update(existing);
                    }
                }
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "All participant changes saved successfully.";
            }

            return RedirectToAction(nameof(Manage), new { eventId = eventId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> BulkDelete(List<Guid> selectedIds, int eventId)
        {
            var currentCoordinatorId = GetCurrentCoordinatorId();

            var eventDetails = await _context.Events.FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventDetails == null) return NotFound("Event not found.");

            if (!User.IsInRole("Admin") && (!currentCoordinatorId.HasValue || eventDetails.CoordinatorId != currentCoordinatorId))
            {
                return Forbid();
            }

            if (selectedIds != null && selectedIds.Any())
            {
                var itemsToRemove = await _context.EventQualifiers
                    .Where(q => selectedIds.Contains(q.Id) && q.EventId == eventId)
                    .ToListAsync();

                if (itemsToRemove.Any())
                {
                    _context.EventQualifiers.RemoveRange(itemsToRemove);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = $"{itemsToRemove.Count} participant(s) deleted successfully.";
                }
            }
            else
            {
                TempData["ErrorMessage"] = "Please select at least one participant to delete.";
            }

            return RedirectToAction(nameof(Manage), new { eventId = eventId });
        }

        // Action for Generate Report View
        [HttpGet]
        public async Task<IActionResult> GenerateReport()
        {
            var qualifiersQuery = await (from q in _context.EventQualifiers
                                         join e in _context.Events on q.EventId equals e.Id
                                         select new
                                         {
                                             Qualifier = q,
                                             EventTitle = e.Title ?? "General",
                                             SportName = e.SportName ?? "General Sport",
                                             Division = e.Division ?? "Uncategorized"
                                         }).ToListAsync();

            // Order helper for Roles: Athletes first, then Coach, Assistant Coach, Chaperon at the end of the sport
            int GetRoleOrder(string? role)
            {
                if (string.IsNullOrWhiteSpace(role)) return 0;
                var r = role.Trim().ToLower();
                if (r == "athlete") return 0;
                if (r == "coach") return 1;
                if (r == "assistant coach") return 2;
                if (r == "chaperon" || r == "chaperone") return 3;
                return 4;
            }

            // Order helper for Gender: Girls first, then Boys
            int GetGenderOrder(string? gender)
            {
                if (string.IsNullOrWhiteSpace(gender)) return 2;
                var g = gender.Trim().ToLower();
                if (g == "w" || g == "female" || g == "girls" || g == "girl") return 0;
                if (g == "m" || g == "male" || g == "boys" || g == "boy") return 1;
                return 2;
            }

            var reportData = qualifiersQuery
                .OrderBy(x => x.Division.ToLower() == "elementary" ? 0 : (x.Division.ToLower() == "secondary" ? 1 : 2))
                .ThenBy(x => x.SportName)
                .ThenBy(x => GetRoleOrder(x.Qualifier.Role))
                .ThenBy(x => x.EventTitle)
                .ThenBy(x => GetGenderOrder(x.Qualifier.Gender))
                .ThenBy(x => x.Qualifier.Team)
                .ThenBy(x => x.Qualifier.ParticipantName)
                .ToList();

            return View(reportData);
        }
    }
}
