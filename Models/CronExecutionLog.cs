using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProvMeet.Models
{
    [Table("prov_cron_execution_logs")]
    public class CronExecutionLog
    {
        [Key]
        [Column("id")]
        public long Id { get; set; }

        [Column("executed_at")]
        public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;

        [Column("task_name")]
        public string TaskName { get; set; } = string.Empty;

        [Column("status")]
        public string Status { get; set; } = "Success"; // Success, Warning, Failed

        [Column("status_code")]
        public int StatusCode { get; set; } = 200;

        [Column("execution_time_ms")]
        public double ExecutionTimeMs { get; set; }

        [Column("details")]
        public string Details { get; set; } = string.Empty;

        [Column("caller_ip")]
        public string? CallerIp { get; set; }

        [Column("user_agent")]
        public string? UserAgent { get; set; }
    }
}
