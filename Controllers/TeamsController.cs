using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using ProvMeet.Data;
using System.Linq;
using System.Threading.Tasks;

namespace ProvMeet.Controllers
{
    [AllowAnonymous]
    public class TeamsController : Controller
    {
        private readonly ApplicationDbContext _context;

        public TeamsController(ApplicationDbContext context) => _context = context;

        public async Task<IActionResult> Dashboard()
        {
            var teams = await _context.Teams.AsNoTracking().OrderBy(t => t.Name).ToListAsync();
            ViewBag.DashboardStandings = await _context.GetTeamStandings().ToListAsync();
            return View(teams);
        }

        public async Task<IActionResult> Details(int? id, string? division = null)
        {
            if (!id.HasValue) return NotFound();
            var team = await _context.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id.Value);
            if (team == null) return NotFound();

            var normalizedDivision = new[] { "Elementary", "Secondary", "Paragames" }
                .FirstOrDefault(value => value.Equals(division, System.StringComparison.OrdinalIgnoreCase));

            var eventsQuery = _context.Events.AsNoTracking().Where(e => e.Status == "Completed"
                && (e.GoldTeamId == id.Value || e.SilverTeamId == id.Value || e.BronzeTeamId == id.Value));
            if (normalizedDivision != null) eventsQuery = eventsQuery.Where(e => e.Division == normalizedDivision);

            var allTallies = await _context.GetTeamStandings().ToListAsync();
            var rankings = normalizedDivision == null
                ? allTallies.Where(t => t.Division == "Elementary" || t.Division == "Secondary")
                    .GroupBy(t => t.TeamId)
                    .Select(g => new { TeamId = g.Key, Gold = g.Sum(x => x.Gold), Silver = g.Sum(x => x.Silver), Bronze = g.Sum(x => x.Bronze) })
                : allTallies.Where(t => t.Division == normalizedDivision)
                    .Select(t => new { t.TeamId, t.Gold, t.Silver, t.Bronze });

            var ordered = rankings.OrderByDescending(t => t.Gold).ThenByDescending(t => t.Silver)
                .ThenByDescending(t => t.Bronze).ThenBy(t => t.TeamId).ToList();
            var target = ordered.FirstOrDefault(t => t.TeamId == id.Value);
            var rank = target == null ? "N/A" : (1 + ordered.Count(t => t.Gold > target.Gold
                || (t.Gold == target.Gold && t.Silver > target.Silver)
                || (t.Gold == target.Gold && t.Silver == target.Silver && t.Bronze > target.Bronze))).ToString();

            ViewBag.Team = team;
            ViewBag.TeamIds = new System.Collections.Generic.List<int> { id.Value };
            ViewBag.Rank = rank;
            ViewBag.IsOverall = normalizedDivision == null;
            ViewBag.SelectedDivision = normalizedDivision;
            return View(await eventsQuery.OrderByDescending(e => e.UpdatedAt).ToListAsync());
        }
    }
}
