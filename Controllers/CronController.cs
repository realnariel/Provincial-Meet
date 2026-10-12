using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using ProvMeet.Data;
using ProvMeet.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ProvMeet.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CronController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<CronController> _logger;

        public CronController(ApplicationDbContext context, IConfiguration configuration, ILogger<CronController> logger)
        {
            _context = context;
            _configuration = configuration;
            _logger = logger;
        }

        [HttpGet("execute")]
        [HttpPost("execute")]
        public async Task<IActionResult> Execute([FromQuery] string? secret)
        {
            var stopwatch = Stopwatch.StartNew();

            // Validate Secret Header or Query Param
            string? expectedSecret = _configuration["CronJobOrg:CronSecret"];
            if (string.IsNullOrWhiteSpace(expectedSecret))
            {
                _logger.LogWarning("Cron execution is disabled because no cron secret is configured.");
                return StatusCode(503, new
                {
                    success = false,
                    message = "Cron execution is not configured."
                });
            }
            string? providedHeaderSecret = Request.Headers["X-Cron-Secret"].FirstOrDefault();
            string? providedAuthHeader = Request.Headers["Authorization"].FirstOrDefault();
            
            bool isAuthorized = false;
            if (!string.IsNullOrEmpty(providedHeaderSecret) && providedHeaderSecret.Equals(expectedSecret, StringComparison.Ordinal))
            {
                isAuthorized = true;
            }
            else if (!string.IsNullOrEmpty(secret) && secret.Equals(expectedSecret, StringComparison.Ordinal))
            {
                isAuthorized = true;
            }
            else if (!string.IsNullOrEmpty(providedAuthHeader) && providedAuthHeader.Equals($"Bearer {expectedSecret}", StringComparison.Ordinal))
            {
                isAuthorized = true;
            }

            string callerIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
            string userAgent = Request.Headers["User-Agent"].ToString();

            if (!isAuthorized)
            {
                stopwatch.Stop();
                _logger.LogWarning("Unauthorized cron execution attempt from IP {Ip}. UserAgent: {UA}", callerIp, userAgent);

                var unauthorizedLog = new CronExecutionLog
                {
                    ExecutedAt = DateTime.UtcNow,
                    TaskName = "Provincial: Unauthorized Trigger Attempt",
                    Status = "Failed",
                    StatusCode = 401,
                    ExecutionTimeMs = stopwatch.Elapsed.TotalMilliseconds,
                    Details = "Request rejected due to missing or invalid secret token.",
                    CallerIp = callerIp,
                    UserAgent = userAgent
                };

                try
                {
                    _context.CronExecutionLogs.Add(unauthorizedLog);
                    await _context.SaveChangesAsync();
                }
                catch { /* Ignore log save error on unauthorized failure */ }

                return Unauthorized(new
                {
                    success = false,
                    message = "Unauthorized: Invalid or missing X-Cron-Secret token.",
                    timestamp = DateTime.UtcNow
                });
            }

            var taskSummary = new List<string>();
            bool isOverallSuccess = true;

            // Task 1: Lightweight Database Ping
            try
            {
                var totalEvents = await _context.Events.CountAsync();
                taskSummary.Add($"HealthCheck: Connection active across {totalEvents} total events.");
            }
            catch (Exception ex)
            {
                isOverallSuccess = false;
                taskSummary.Add($"HealthCheck Error: {ex.Message}");
            }

            // Task 2: Maintenance Cleanup (Delete logs older than 5 days)
            try
            {
                var cutoff = DateTime.UtcNow.AddDays(-5);
                var oldLogs = await _context.CronExecutionLogs.Where(l => l.ExecutedAt < cutoff).ToListAsync();
                if (oldLogs.Any())
                {
                    _context.CronExecutionLogs.RemoveRange(oldLogs);
                    await _context.SaveChangesAsync();
                }
                taskSummary.Add($"LogCleanup: Purged {oldLogs.Count} execution log entries older than 5 days.");
            }
            catch (Exception ex)
            {
                taskSummary.Add($"LogCleanup Warning: {ex.Message}");
            }

            stopwatch.Stop();
            double durationMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 2);

            // Log execution to DB
            var execLog = new CronExecutionLog
            {
                ExecutedAt = DateTime.UtcNow,
                TaskName = "Provincial: Automated Cron Trigger",
                Status = isOverallSuccess ? "Success" : "Warning",
                StatusCode = 200,
                ExecutionTimeMs = durationMs,
                Details = string.Join(" | ", taskSummary),
                CallerIp = callerIp,
                UserAgent = string.IsNullOrWhiteSpace(userAgent) ? "cron-job.org Bot" : userAgent
            };

            try
            {
                _context.CronExecutionLogs.Add(execLog);
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist CronExecutionLog entry");
            }

            return Ok(new
            {
                success = isOverallSuccess,
                executedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss 'UTC'"),
                executionTimeMs = durationMs,
                tasksExecuted = taskSummary,
                message = isOverallSuccess ? "All cron tasks executed successfully." : "Cron tasks completed with warnings."
            });
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok(new
            {
                status = "Online",
                service = "Provincial Meet Cron Webhook",
                timestamp = DateTime.UtcNow,
                cronJobOrgCompatible = true
            });
        }
    }
}
